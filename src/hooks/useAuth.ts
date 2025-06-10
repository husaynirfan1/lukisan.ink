import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, User, withRetry, handleSupabaseError, checkSupabaseConnectivity } from '../lib/supabase';
import { getUserSubscription } from '../lib/stripe';
import { transferTempImagesToUser, clearGuestSession } from '../lib/guestImageManager';
import toast from 'react-hot-toast';

// Define a longer, more realistic timeout for the entire auth flow
const AUTH_FLOW_TIMEOUT_MS = 30000; // 30 seconds
const STALE_DATA_THRESHOLD_MS = 60000; // 1 minute

interface AuthState {
  user: User | null;
  loading: boolean;
  subscription: any;
  error: string | null;
  authStep: string;
  authInitialized: boolean;
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    subscription: null,
    error: null,
    authStep: 'initializing',
    authInitialized: false,
  });

  const isFetchingProfile = useRef(false);
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSuccessfulFetchTimestamp = useRef<number>(0);
  
  // ENHANCED: Global transfer management with session-based tracking
  const transferState = useRef({
    isTransferring: false,
    hasTransferredInSession: false, // Track if transfer happened in this session
    lastTransferTime: 0,
    transferPromise: null as Promise<any> | null
  });

  // Simple debug logger
  const debugLog = (step: string, data: any = {}) => {
    console.log(`[AUTH] ${new Date().toISOString()} | ${step}`, data);
  };

  const fetchUserProfile = useCallback(async (userId: string, isInitialLoad = false) => {
    if (isFetchingProfile.current) {
      debugLog('fetchUserProfile_skipped', { reason: 'Already fetching' });
      return;
    }

    debugLog('fetchUserProfile_start', { userId });
    isFetchingProfile.current = true;
    setState(prev => ({ ...prev, loading: true, error: null, authStep: 'fetching_profile' }));

    const operationTimeout = setTimeout(() => {
        debugLog('fetchUserProfile_timeout');
        isFetchingProfile.current = false;
        setState(prev => ({
            ...prev,
            loading: false,
            error: 'Profile loading took too long. Please refresh the page.',
            authStep: 'profile_fetch_timeout',
            authInitialized: true,
        }));
    }, AUTH_FLOW_TIMEOUT_MS);

    try {
      // Enhanced: Check connectivity first
      const isConnected = await checkSupabaseConnectivity();
      if (!isConnected) {
        throw new Error('Unable to connect to the server. Please check your internet connection.');
      }

      // Get the current auth user to check email verification status with retry
      const { data: { user: authUser }, error: authError } = await withRetry(
        () => supabase.auth.getUser(),
        3,
        1000
      );
      
      if (authError) {
        throw new Error(`Auth user fetch error: ${authError.message}`);
      }

      // 1. Use .maybeSingle() to prevent an error if the user profile doesn't exist yet.
      const { data: userProfile, error: profileError } = await withRetry(
        () => supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
        3,
        1000
      );

      // Throw if there's a real error, but ignore 'PGRST116' (no rows found), which we now expect for new users.
      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(`Profile fetch error: ${profileError.message}`);
      }

      let finalUserProfile = userProfile;

      // 2. NEW: If the profile doesn't exist, create it on the fly.
      if (!finalUserProfile) {
        debugLog('fetchUserProfile_creating_profile');
        setState(prev => ({ ...prev, authStep: 'creating_profile' }));
        
        if (!authUser) throw new Error('Could not get authenticated user to create a profile.');

        const newUserData = {
            id: userId,
            email: authUser.email!,
            name: authUser.user_metadata?.full_name || authUser.email!.split('@')[0],
            avatar_url: authUser.user_metadata?.avatar_url,
            tier: 'free',
            credits_remaining: 0,
            daily_generations: 0,
            // CRITICAL: Set email verification based on Supabase auth status
            is_email_verified: authUser.email_confirmed_at ? true : false,
        };

        const { data: createdUser, error: createError } = await withRetry(
          () => supabase
            .from('users')
            .insert(newUserData)
            .select()
            .single(),
          3,
          1000
        );

        if (createError) throw new Error(`Profile creation failed: ${createError.message}`);
        
        finalUserProfile = createdUser;
        toast.success('Welcome! Your profile has been created.');
      } else {
        // CRITICAL: Update existing user's email verification status from Supabase auth
        if (authUser) {
          const isVerifiedInAuth = authUser.email_confirmed_at ? true : false;
          
          // Only update if there's a mismatch
          if (finalUserProfile.is_email_verified !== isVerifiedInAuth) {
            debugLog('Syncing email verification status', { 
              currentStatus: finalUserProfile.is_email_verified, 
              authStatus: isVerifiedInAuth 
            });
            
            const { error: updateError } = await withRetry(
              () => supabase
                .from('users')
                .update({ is_email_verified: isVerifiedInAuth })
                .eq('id', userId),
              2,
              1000
            );

            if (!updateError) {
              finalUserProfile.is_email_verified = isVerifiedInAuth;
            }
          }
        }
      }

      // 3. From here, the function continues as normal with a valid user profile.
      debugLog('fetchUserProfile_fetching_subscription');
      const subscription = await getUserSubscription();

      debugLog('fetchUserProfile_success');
      lastSuccessfulFetchTimestamp.current = Date.now();
      setState({
          user: finalUserProfile,
          subscription: subscription,
          loading: false,
          error: null,
          authStep: 'complete',
          authInitialized: true,
      });

      // ENHANCED: Handle guest image transfer with session-based duplicate prevention
      await handleGuestImageTransfer(finalUserProfile);

    } catch (error: any) {
      debugLog('fetchUserProfile_error', { errorMessage: error.message });
      const errorInfo = handleSupabaseError(error, 'fetchUserProfile');
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorInfo.userMessage,
        authStep: errorInfo.isNetworkError ? 'network_error' : 'profile_fetch_error',
        authInitialized: true,
      }));
    } finally {
      clearTimeout(operationTimeout);
      isFetchingProfile.current = false;
    }
  }, []);

  // ENHANCED: Session-based guest image transfer handler
  const handleGuestImageTransfer = async (user: User) => {
    const userId = user.id;
    const now = Date.now();
    
    debugLog('handleGuestImageTransfer_start', { 
      userId, 
      isTransferring: transferState.current.isTransferring,
      hasTransferredInSession: transferState.current.hasTransferredInSession,
      timeSinceLastTransfer: now - transferState.current.lastTransferTime
    });

    // ENHANCED: Session-based duplicate prevention
    if (transferState.current.hasTransferredInSession) {
      debugLog('handleGuestImageTransfer_already_transferred_in_session');
      return;
    }

    if (transferState.current.isTransferring) {
      debugLog('handleGuestImageTransfer_already_in_progress');
      return;
    }

    // Prevent rapid successive transfers (within 5 seconds)
    if (now - transferState.current.lastTransferTime < 5000) {
      debugLog('handleGuestImageTransfer_too_soon_since_last_transfer');
      return;
    }

    // If there's already a transfer promise, wait for it instead of starting a new one
    if (transferState.current.transferPromise) {
      debugLog('handleGuestImageTransfer_waiting_for_existing_promise');
      try {
        await transferState.current.transferPromise;
      } catch (error) {
        console.error('Existing transfer promise failed:', error);
      }
      return;
    }

    // Set all the locks
    transferState.current.isTransferring = true;
    transferState.current.hasTransferredInSession = true; // Mark as transferred for this session
    transferState.current.lastTransferTime = now;

    // Create the transfer promise
    transferState.current.transferPromise = (async () => {
      try {
        debugLog('handleGuestImageTransfer_starting_transfer');
        
        const transferResult = await transferTempImagesToUser(userId);
        
        debugLog('handleGuestImageTransfer_transfer_completed', {
          success: transferResult.success,
          transferredCount: transferResult.transferredCount,
          skippedCount: transferResult.skippedCount,
          failedCount: transferResult.failedCount
        });

        // ENHANCED: Only show notifications for actual transfers, not skips
        if (transferResult.insufficientCredits) {
          toast.error(`Not enough credits to transfer images. Need ${transferResult.creditsNeeded}, have ${transferResult.creditsAvailable}`, {
            icon: '💳',
            duration: 5000,
          });
        } else if (transferResult.success && transferResult.transferredCount > 0) {
          // Only show success notification if images were actually transferred
          toast.success(`Successfully transferred ${transferResult.transferredCount} logo(s) to your library!`, {
            icon: '✅',
            duration: 4000,
          });
          
          // Clear guest session after successful transfer
          await clearGuestSession();
        }
        // Don't show any notification for skipped transfers (duplicates)
        
        // Only show error notification if there were actual failures (not skips)
        if (transferResult.errors.length > 0 && transferResult.failedCount > 0) {
          console.error('Transfer errors:', transferResult.errors);
          toast.error('Some images failed to transfer. Please try generating new logos.', {
            icon: '⚠️',
            duration: 4000,
          });
        }

      } catch (error: any) {
        console.error('Error during guest image transfer:', error);
        toast.error('Failed to transfer guest images. Please try generating new logos.', {
          icon: '⚠️',
          duration: 4000,
        });
      } finally {
        // Release locks
        transferState.current.isTransferring = false;
        transferState.current.transferPromise = null;
        debugLog('handleGuestImageTransfer_completed');
      }
    })();

    await transferState.current.transferPromise;
  };

  const signOut = async () => {
    debugLog('signOut_start');
    
    // Clear all transfer state
    transferState.current = {
      isTransferring: false,
      hasTransferredInSession: false,
      lastTransferTime: 0,
      transferPromise: null
    };
    
    try {
      await withRetry(() => supabase.auth.signOut(), 2, 1000);
    } catch (error) {
      console.error('Sign out error:', error);
      // Continue with cleanup even if sign out fails
    }
    
    // The onAuthStateChange listener will handle the state reset.
    // We also clear refs and state here as a fallback.
    lastSuccessfulFetchTimestamp.current = 0;
    setState({ 
      user: null, 
      loading: false, 
      subscription: null, 
      error: null, 
      authStep: 'signed_out',
      authInitialized: true 
    });
    window.location.href = '/'; // Force a clean reload to the home page
  };

  // Main effect for handling initialization and auth state changes
  useEffect(() => {
    debugLog('Auth effect initializing...');
    let isMounted = true;

    // Safety net: If no definitive auth event arrives in 3.5 seconds, stop loading.
    const safetyTimeout = setTimeout(() => {
      if (isMounted && !state.authInitialized) {
        debugLog('Auth check timed out. Assuming no session.');
        setState(prev => ({ ...prev, loading: false, authInitialized: true, authStep: 'no_session_found_timeout' }));
      }
    }, 3500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        clearTimeout(safetyTimeout);
        if (!isMounted) return;

        debugLog('Auth state change', { event, hasUser: !!session?.user });

        // KEY CHANGE: Treat INITIAL_SESSION (with a user) and SIGNED_IN the same.
        if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          debugLog('User session detected. Fetching profile...', { event });
          
          // Reset transfer state for new sign-ins only (not for token refresh)
          if (event === 'SIGNED_IN') {
            transferState.current = {
              isTransferring: false,
              hasTransferredInSession: false,
              lastTransferTime: 0,
              transferPromise: null
            };
          }
          
          fetchUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          debugLog('User signed out.');
          transferState.current = {
            isTransferring: false,
            hasTransferredInSession: false,
            lastTransferTime: 0,
            transferPromise: null
          };
          setState({ 
            user: null, 
            loading: false, 
            subscription: null, 
            error: null, 
            authStep: 'signed_out', 
            authInitialized: true 
          });
        } else if (!session?.user) {
          debugLog('No user session detected.');
          setState(prev => ({ ...prev, loading: false, authInitialized: true, authStep: 'no_session' }));
        }
      }
    );

    return () => {
      isMounted = false;
      debugLog('Auth effect cleanup');
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []); // Correctly empty dependency array

  // Effect for handling tab visibility to prevent stale data
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        debugLog('Tab became visible');
        const isDataStale = Date.now() - lastSuccessfulFetchTimestamp.current > STALE_DATA_THRESHOLD_MS;
        
        // If we have a user but data is potentially stale, refetch.
        if (state.user && isDataStale) {
            debugLog('Data is stale, refetching user profile.');
            fetchUserProfile(state.user.id);
        } else if (!state.user && !state.loading) {
            // If we don't have a user and aren't loading, check the session.
            debugLog('No user in state, re-checking session on visibility change.');
            withRetry(() => supabase.auth.getSession(), 2, 1000)
              .then(({ data: { session } }) => {
                if(session?.user) {
                    fetchUserProfile(session.user.id);
                }
              })
              .catch(error => {
                console.error('Session check failed:', error);
              });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.user, state.loading, fetchUserProfile]);

  // Email verification functions
  const resendVerificationEmail = async () => {
    if (!state.user) {
      toast.error('No user found');
      return;
    }

    try {
      debugLog('Resending verification email', { email: state.user.email });
      
      // Use Supabase's built-in resend function with retry
      const { error } = await withRetry(
        () => supabase.auth.resend({
          type: 'signup',
          email: state.user!.email,
        }),
        2,
        1000
      );

      if (error) {
        console.error('Error resending verification email:', error);
        const errorInfo = handleSupabaseError(error, 'resendVerificationEmail');
        toast.error(errorInfo.userMessage);
        return;
      }

      toast.success('Verification email sent! Please check your inbox.');
    } catch (error: any) {
      console.error('Error in resendVerificationEmail:', error);
      const errorInfo = handleSupabaseError(error, 'resendVerificationEmail');
      toast.error(errorInfo.userMessage);
    }
  };

  const refreshUser = async () => {
    if (state.user && !isFetchingProfile.current) {
      debugLog('Refetching user data');
      await fetchUserProfile(state.user.id);
    }
  };

  // CRITICAL: Check for email verification on URL hash change (when user clicks verification link)
  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash;
      
      if (hash.includes('type=signup') || hash.includes('type=email_change')) {
        debugLog('Email verification link detected in URL');
        
        // Small delay to ensure auth state is updated
        setTimeout(async () => {
          await refreshUser();
          toast.success('Email verified successfully!');
          
          // Clear the hash from URL
          window.history.replaceState(null, null, window.location.pathname);
        }, 1000);
      }
    };

    // Check on mount
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [state.user]);

  // Helper functions remain the same...
  const canGenerate = () => {
    if (!state.user) return false;
    if (state.subscription?.subscription_status === 'active') {
      return state.user.credits_remaining > 0;
    }
    const today = new Date().toISOString().split('T')[0];
    const lastGenDate = state.user.last_generation_date?.split('T')[0];
    if (lastGenDate !== today) return true;
    return state.user.daily_generations < 3;
  };

  const getRemainingGenerations = () => {
    if (!state.user) return 0;
    if (state.subscription?.subscription_status === 'active') {
        return state.user.credits_remaining;
    }
    const today = new Date().toISOString().split('T')[0];
    const lastGenDate = state.user.last_generation_date?.split('T')[0];
    if (lastGenDate !== today) return 3;
    return Math.max(0, 3 - state.user.daily_generations);
  };

  const getUserTier = () => {
    return state.subscription?.subscription_status === 'active' ? 'pro' : 'free';
  };

  const refetchUser = () => {
    if (state.user) {
        fetchUserProfile(state.user.id);
    }
  }

  return {
    user: state.user,
    loading: state.loading,
    subscription: state.subscription,
    error: state.error,
    authStep: state.authStep,
    authInitialized: state.authInitialized,
    isEmailVerified: state.user?.is_email_verified || false,
    signOut,
    canGenerate,
    getRemainingGenerations,
    getUserTier,
    refetchUser,
    resendVerificationEmail,
    refreshUser
  };
};