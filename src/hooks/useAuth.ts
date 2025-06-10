import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, User } from '../lib/supabase';
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
  
  // ENHANCED: Global transfer management to prevent any duplicates
  const transferState = useRef({
    isTransferring: false,
    hasTransferredForUser: new Set<string>(), // Track which users we've already transferred for
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
      // 1. Use .maybeSingle() to prevent an error if the user profile doesn't exist yet.
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Throw if there's a real error, but ignore 'PGRST116' (no rows found), which we now expect for new users.
      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(`Profile fetch error: ${profileError.message}`);
      }

      let finalUserProfile = userProfile;

      // 2. NEW: If the profile doesn't exist, create it on the fly.
      if (!finalUserProfile) {
        debugLog('fetchUserProfile_creating_profile');
        setState(prev => ({ ...prev, authStep: 'creating_profile' }));
        
        // Get the master user object from auth to access metadata like name/email
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) throw new Error('Could not get authenticated user to create a profile.');

        // Check if email is confirmed in Supabase auth
        const isEmailConfirmed = authUser.email_confirmed_at !== null;

        const newUserData = {
            id: userId,
            email: authUser.email!,
            name: authUser.user_metadata?.full_name || authUser.email!.split('@')[0],
            avatar_url: authUser.user_metadata?.avatar_url,
            tier: 'free',
            credits_remaining: 0,
            daily_generations: 0,
            is_email_verified: isEmailConfirmed, // Set based on Supabase auth confirmation
            email_verification_token: null,
        };

        const { data: createdUser, error: createError } = await supabase
            .from('users')
            .insert(newUserData)
            .select()
            .single();

        if (createError) throw new Error(`Profile creation failed: ${createError.message}`);
        
        finalUserProfile = createdUser;
        
        // Show appropriate welcome message based on email verification
        if (isEmailConfirmed) {
          toast.success('Welcome! Your profile has been created.');
        } else {
          toast.success('Welcome! Please check your email to verify your account.');
        }
      } else {
        // Check if we need to sync email verification status with Supabase auth
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const isSupabaseConfirmed = authUser?.email_confirmed_at !== null;
        
        if (isSupabaseConfirmed && !finalUserProfile.is_email_verified) {
          // Update our flag to match Supabase confirmation
          const { data: updatedUser } = await supabase
            .from('users')
            .update({ is_email_verified: true })
            .eq('id', userId)
            .select()
            .single();
          
          if (updatedUser) {
            finalUserProfile = updatedUser;
            toast.success('Email verification confirmed!');
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

      // Show email verification reminder for unverified users
      if (finalUserProfile && !finalUserProfile.is_email_verified) {
        // Delay the toast to avoid overwhelming the user with notifications
        setTimeout(() => {
          toast('Please verify your email address to access all features', {
            icon: '📧',
            duration: 5000,
            style: {
              background: '#FEF3C7',
              color: '#92400E',
              border: '1px solid #F59E0B',
            },
          });
        }, 2000);
      }

      // ENHANCED: Handle guest image transfer with comprehensive duplicate prevention
      await handleGuestImageTransfer(finalUserProfile);

    } catch (error: any) {
      debugLog('fetchUserProfile_error', { errorMessage: error.message });
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'An unknown error occurred while fetching your profile.',
        authStep: 'profile_fetch_error',
        authInitialized: true,
      }));
    } finally {
      clearTimeout(operationTimeout);
      isFetchingProfile.current = false;
    }
  }, []);

  // ENHANCED: Centralized guest image transfer handler with bulletproof duplicate prevention
  const handleGuestImageTransfer = async (user: User) => {
    const userId = user.id;
    const now = Date.now();
    
    debugLog('handleGuestImageTransfer_start', { 
      userId, 
      isTransferring: transferState.current.isTransferring,
      hasTransferredForUser: transferState.current.hasTransferredForUser.has(userId),
      timeSinceLastTransfer: now - transferState.current.lastTransferTime
    });

    // Multiple layers of duplicate prevention
    if (transferState.current.isTransferring) {
      debugLog('handleGuestImageTransfer_already_in_progress');
      return;
    }

    if (transferState.current.hasTransferredForUser.has(userId)) {
      debugLog('handleGuestImageTransfer_already_transferred_for_user');
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
    transferState.current.hasTransferredForUser.add(userId);
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

        // Show notifications based on results
        if (transferResult.insufficientCredits) {
          toast.error(`Not enough credits to transfer images. Need ${transferResult.creditsNeeded}, have ${transferResult.creditsAvailable}`, {
            icon: '💳',
            duration: 5000,
          });
        } else if (transferResult.success && transferResult.transferredCount > 0) {
          toast.success(`Successfully transferred ${transferResult.transferredCount} logo(s) to your library!`, {
            icon: '✅',
            duration: 4000,
          });
          
          // Clear guest session after successful transfer
          await clearGuestSession();
        } else if (transferResult.skippedCount > 0 && transferResult.transferredCount === 0) {
          // Only log this, don't show notification for skipped duplicates
          debugLog('handleGuestImageTransfer_all_skipped', { skippedCount: transferResult.skippedCount });
        }
        
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
      hasTransferredForUser: new Set(),
      lastTransferTime: 0,
      transferPromise: null
    };
    
    await supabase.auth.signOut();
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
              hasTransferredForUser: new Set(),
              lastTransferTime: 0,
              transferPromise: null
            };
          }
          
          fetchUserProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          debugLog('User signed out.');
          transferState.current = {
            isTransferring: false,
            hasTransferredForUser: new Set(),
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
            supabase.auth.getSession().then(({ data: { session } }) => {
                if(session?.user) {
                    fetchUserProfile(session.user.id);
                }
            });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.user, state.loading, fetchUserProfile]);

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
    signOut,
    canGenerate,
    getRemainingGenerations,
    getUserTier,
    refetchUser
  };
};