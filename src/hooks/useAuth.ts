import { useState, useEffect, useRef } from 'react';
import { supabase, User } from '../lib/supabase';
import { getUserSubscription } from '../lib/stripe';
import { transferTempImagesToUser, clearGuestSession } from '../lib/guestImageManager';
import toast from 'react-hot-toast';

interface AuthState {
  user: User | null;
  loading: boolean;
  subscription: any;
  error: string | null;
  authStep: string;
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    subscription: null,
    error: null,
    authStep: 'initializing'
  });

  // Use refs to prevent multiple concurrent operations and track state
  const isInitializing = useRef(false);
  const isFetchingProfile = useRef(false);
  const hasShownError = useRef(false);
  const profileFetchTimeout = useRef<NodeJS.Timeout | null>(null);
  const authTimeout = useRef<NodeJS.Timeout | null>(null);
  const isTabVisible = useRef(true);
  const hasInitialized = useRef(false);
  const isSigningOut = useRef(false);
  const hasAttemptedGuestImageTransferRef = useRef(false);

  // Debug logging function
  const debugLog = (step: string, data?: any, error?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[AUTH DEBUG ${timestamp}] ${step}:`, { data, error, tabVisible: isTabVisible.current });
    
    setState(prev => ({ ...prev, authStep: step }));
  };

  // Show error toast only once per session
  const showErrorToast = (message: string) => {
    if (!hasShownError.current && isTabVisible.current) {
      hasShownError.current = true;
      toast.error(message);
      // Reset after 5 seconds to allow new errors
      setTimeout(() => {
        hasShownError.current = false;
      }, 5000);
    }
  };

  // Clear all timeouts
  const clearTimeouts = () => {
    if (profileFetchTimeout.current) {
      clearTimeout(profileFetchTimeout.current);
      profileFetchTimeout.current = null;
    }
    if (authTimeout.current) {
      clearTimeout(authTimeout.current);
      authTimeout.current = null;
    }
  };

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      const wasVisible = isTabVisible.current;
      isTabVisible.current = !document.hidden;
      
      debugLog(`Tab visibility changed: ${isTabVisible.current ? 'visible' : 'hidden'}`);
      
      // If tab becomes visible again and we were loading, check if we need to recover
      if (!wasVisible && isTabVisible.current && state.loading) {
        debugLog('Tab became visible while loading - checking auth state');
        
        // Give a moment for any pending operations to complete
        setTimeout(() => {
          if (state.loading && state.authStep.includes('fetching') || state.authStep.includes('checking')) {
            debugLog('Recovering from tab switch timeout');
            setState(prev => ({ 
              ...prev, 
              loading: false, 
              error: 'Session restored after tab switch',
              authStep: 'tab_recovery'
            }));
            
            // Try to get current session
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session?.user && !isFetchingProfile.current) {
                debugLog('Recovering user session after tab switch');
                fetchUserProfile(session.user.id);
              }
            });
          }
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Set initial visibility state
    isTabVisible.current = !document.hidden;
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.loading, state.authStep]);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitializing.current || hasInitialized.current) {
      debugLog('Already initialized or initializing, skipping');
      return;
    }

    isInitializing.current = true;
    hasInitialized.current = true;
    debugLog('Starting auth initialization');
    
    // Set up auth timeout with longer duration, but only if tab is visible
    authTimeout.current = setTimeout(() => {
      if (state.loading && isInitializing.current && isTabVisible.current) {
        debugLog('Auth timeout reached', null, 'Authentication taking too long');
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Authentication timeout',
          authStep: 'timeout'
        }));
        showErrorToast('Authentication is taking longer than expected. Please refresh the page.');
        isInitializing.current = false;
        clearTimeouts();
      }
    }, 25000); // 25 second timeout (longer to account for tab switching)

    // Get initial session
    const initializeAuth = async () => {
      try {
        debugLog('Getting initial session');
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          debugLog('Initial session error', null, error);
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            error: error.message,
            authStep: 'session_error'
          }));
          isInitializing.current = false;
          clearTimeouts();
          return;
        }

        if (session?.user) {
          debugLog('Initial session found', { userId: session.user.id });
          await fetchUserProfile(session.user.id);
        } else {
          debugLog('No initial session found');
          setState(prev => ({ 
            ...prev, 
            loading: false,
            authStep: 'no_session'
          }));
        }
      } catch (error: any) {
        debugLog('Initialize auth error', null, error);
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to initialize authentication',
          authStep: 'init_error'
        }));
        showErrorToast('Failed to initialize authentication');
      } finally {
        isInitializing.current = false;
        clearTimeouts();
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        debugLog('Auth state change', { event, userId: session?.user?.id });
        
        // Skip if we're already initializing or tab is not visible
        if (isInitializing.current || !isTabVisible.current) {
          debugLog('Skipping auth state change - already initializing or tab not visible');
          return;
        }
        
        try {
          if (session?.user) {
            if (event === 'SIGNED_IN') {
              debugLog('New SIGNED_IN event, resetting guest image transfer attempt flag.');
              hasAttemptedGuestImageTransferRef.current = false;
            }
            debugLog('User session detected, fetching profile');
            await fetchUserProfile(session.user.id);
          } else {
            debugLog('No user session, clearing state and resetting transfer attempt flag.');
            hasAttemptedGuestImageTransferRef.current = false;
            setState(prev => ({
              ...prev,
              user: null,
              subscription: null,
              loading: false,
              error: null,
              authStep: 'signed_out'
            }));
          }
        } catch (error: any) {
          debugLog('Auth state change error', null, error);
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Failed to process authentication change',
            authStep: 'state_change_error'
          }));
          // Don't show toast for state change errors as they're often transient
        }
      }
    );

    return () => {
      clearTimeouts();
      subscription.unsubscribe();
      isInitializing.current = false;
    };
  }, []); // Empty dependency array to run only once

  const fetchUserProfile = async (userId: string) => {
    // Prevent concurrent profile fetches
    if (isFetchingProfile.current) {
      debugLog('Profile fetch already in progress, skipping');
      return;
    }

    // Don't fetch if tab is not visible
    if (!isTabVisible.current) {
      debugLog('Tab not visible, deferring profile fetch');
      return;
    }

    isFetchingProfile.current = true;
    clearTimeouts(); // Clear any existing timeouts

    // Set up profile fetch timeout - longer for tab switching scenarios
    profileFetchTimeout.current = setTimeout(() => {
      if (isFetchingProfile.current && isTabVisible.current) {
        debugLog('Profile fetch timeout reached');
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Profile fetch timeout',
          authStep: 'profile_fetch_timeout'
        }));
        showErrorToast('Profile loading is taking too long. Please try refreshing the page.');
        isFetchingProfile.current = false;
      }
    }, 15000); // 15 second timeout for profile fetch

    try {
      let transferAttemptedThisRun = false;
      debugLog('Starting profile fetch', { userId });
      setState(prev => ({ ...prev, loading: true, authStep: 'fetching_profile' }));
      
      debugLog('Checking for existing profile');
      
      // Create a promise that will timeout
      const profilePromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      // Race the profile fetch against a timeout - longer timeout for tab switching
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Database query timeout'));
        }, 12000); // 12 second database timeout
      });

      const { data: existingUser, error: fetchError } = await Promise.race([
        profilePromise,
        timeoutPromise
      ]) as any;

      // Check if tab is still visible after async operation
      if (!isTabVisible.current) {
        debugLog('Tab became hidden during profile fetch, aborting');
        isFetchingProfile.current = false;
        clearTimeouts();
        return;
      }

      if (fetchError) {
        debugLog('Profile fetch error', null, fetchError);
        setState(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to load user profile',
          authStep: 'profile_fetch_error'
        }));
        showErrorToast('Failed to load user profile');
        return;
      }

      // If user doesn't exist, create profile
      if (!existingUser) {
        debugLog('No existing profile found, creating new profile');
        
        // Get user metadata from auth
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !authUser) {
          debugLog('Failed to get auth user', null, authError);
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Failed to get user information',
            authStep: 'auth_user_error'
          }));
          showErrorToast('Failed to get user information');
          return;
        }

        const newUserData = {
          id: userId,
          email: authUser.email!,
          name: authUser.user_metadata?.full_name || 
                authUser.user_metadata?.name || 
                authUser.email!.split('@')[0],
          avatar_url: authUser.user_metadata?.avatar_url || 
                     authUser.user_metadata?.picture,
          tier: 'free',
          credits_remaining: 0,
          daily_generations: 0,
        };

        debugLog('Creating new user profile', newUserData);

        // Create profile with timeout
        const createPromise = supabase
          .from('users')
          .insert(newUserData)
          .select()
          .single();

        const createTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Profile creation timeout'));
          }, 12000);
        });

        const { data: createdUser, error: createError } = await Promise.race([
          createPromise,
          createTimeoutPromise
        ]) as any;

        if (createError) {
          debugLog('Profile creation error', null, createError);
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Failed to create user profile',
            authStep: 'profile_creation_error'
          }));
          showErrorToast('Failed to create user profile');
          return;
        }

        debugLog('Profile created successfully', createdUser);
        setState(prev => ({ 
          ...prev, 
          user: createdUser,
          authStep: 'profile_created'
        }));
        toast.success('Account created successfully!');

        // Transfer any guest images after profile creation
        if (!hasAttemptedGuestImageTransferRef.current) {
          let successThisAttempt = false;
          try {
            debugLog('Attempting guest image transfer for new user.');
            const transferResult = await transferTempImagesToUser(userId);
            // Consider transfer successful if success flag is true or items were transferred
            if (transferResult.success || transferResult.transferredCount > 0) {
              successThisAttempt = true;
              if (transferResult.transferredCount > 0) {
                toast.success(`Transferred ${transferResult.transferredCount} logo(s) to your library!`);
              }
            } else if (transferResult.errors.length > 0) {
              // Log errors but don't necessarily treat as a hard fail preventing future attempts
              // unless transferResult.success is definitively false.
              console.warn(`Guest image transfer for new user had issues: ${transferResult.errors.join('; ')}`);
              if (!transferResult.success) { // If the result explicitly states failure
                 // Potentially do not set successThisAttempt = true
              }
            }
          } catch (transferError) {
            console.warn('Failed to transfer guest images for new user:', transferError);
            // Do not set successThisAttempt = true, allowing retry
          }

          if (successThisAttempt) {
            hasAttemptedGuestImageTransferRef.current = true;
            transferAttemptedThisRun = true;
          }
        } else {
          debugLog('Guest image transfer already successfully attempted for this session (new user path).');
        }
      } else {
        debugLog('Existing profile found', existingUser);
        setState(prev => ({ 
          ...prev, 
          user: existingUser,
          authStep: 'profile_loaded'
        }));

        // Transfer any guest images for existing users too
        if (!hasAttemptedGuestImageTransferRef.current) {
          let successThisAttempt = false;
          try {
            debugLog('Attempting guest image transfer for existing user.');
            const transferResult = await transferTempImagesToUser(userId);
            if (transferResult.success || transferResult.transferredCount > 0) {
              successThisAttempt = true;
              if (transferResult.transferredCount > 0) {
                toast.success(`Transferred ${transferResult.transferredCount} logo(s) to your library!`);
              }
            } else if (transferResult.errors.length > 0) {
              console.warn(`Guest image transfer for existing user had issues: ${transferResult.errors.join('; ')}`);
              if (!transferResult.success) {
                // Potentially do not set successThisAttempt = true
              }
            }
          } catch (transferError) {
            console.warn('Failed to transfer guest images for existing user:', transferError);
            // Do not set successThisAttempt = true, allowing retry
          }

          if (successThisAttempt) {
            hasAttemptedGuestImageTransferRef.current = true;
            transferAttemptedThisRun = true;
          }
        } else {
          debugLog('Guest image transfer already successfully attempted for this session (existing user path).');
        }
      }

      // Placed after both the new user and existing user blocks' transfer logic
      if (transferAttemptedThisRun) { // Only clear if a successful transfer was made in THIS run
          try {
              debugLog('Clearing guest session after successful transfer attempt in this run.');
              await clearGuestSession();
          } catch (clearError) {
              console.warn('Failed to clear guest session:', clearError);
          }
      }
      
      // Fetch subscription data (non-blocking)
      try {
        debugLog('Fetching subscription data');
        const sub = await getUserSubscription();
        debugLog('Subscription data fetched', sub);
        setState(prev => ({ 
          ...prev, 
          subscription: sub,
          loading: false,
          error: null,
          authStep: 'complete'
        }));
      } catch (subError: any) {
        debugLog('Subscription fetch error', null, subError);
        // Don't fail the whole auth flow for subscription errors
        setState(prev => ({ 
          ...prev, 
          loading: false,
          error: null,
          authStep: 'complete_no_subscription'
        }));
      }
    } catch (error: any) {
      debugLog('Unexpected error in fetchUserProfile', null, error);
      
      let errorMessage = 'An unexpected error occurred';
      if (error.message.includes('timeout')) {
        errorMessage = 'Profile loading timed out. Please try refreshing the page.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage,
        authStep: 'unexpected_error'
      }));
      showErrorToast(errorMessage);
    } finally {
      isFetchingProfile.current = false;
      clearTimeouts();
    }
  };

  const signOut = async () => {
    // Prevent multiple concurrent sign out attempts
    if (isSigningOut.current) {
      debugLog('Sign out already in progress, skipping');
      return;
    }

    isSigningOut.current = true;
    hasAttemptedGuestImageTransferRef.current = false;

    try {
      debugLog('Starting sign out');
      setState(prev => ({ ...prev, loading: true, authStep: 'signing_out' }));
      
      // Clear guest session data on sign out
      await clearGuestSession();
      
      // Set a timeout for sign out operation
      const signOutTimeout = setTimeout(() => {
        debugLog('Sign out timeout reached');
        // Force reset state even if sign out times out
        setState({
          user: null,
          subscription: null,
          loading: false,
          error: null,
          authStep: 'signed_out_timeout'
        });
        toast.success('Signed out (timeout)');
        isSigningOut.current = false;
        
        // Redirect after timeout
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      }, 10000); // 10 second timeout for sign out

      const { error } = await supabase.auth.signOut();
      
      clearTimeout(signOutTimeout);

      if (error) {
        debugLog('Sign out error', null, error);
        
        // Check if the error is about session not found - this means user is already signed out
        if (error.message.includes('Session from session_id claim in JWT does not exist') || 
            error.message.includes('session_not_found') ||
            error.message.includes('Invalid JWT') ||
            error.message.includes('JWT expired')) {
          debugLog('Session already invalid on server, treating as successful signout');
          toast.success('Signed out successfully');
        } else {
          debugLog('Actual sign out error occurred', null, error);
          toast.error(`Sign out failed: ${error.message}`);
        }
      } else {
        debugLog('Sign out successful');
        toast.success('Signed out successfully');
      }
    } catch (error: any) {
      debugLog('Unexpected sign out error', null, error);
      toast.error('An unexpected error occurred during sign out');
    } finally {
      // Always reset client-side state regardless of server response
      debugLog('Resetting client-side auth state');
      setState({
        user: null,
        subscription: null,
        loading: false,
        error: null,
        authStep: 'signed_out'
      });
      
      // Reset refs
      isInitializing.current = false;
      isFetchingProfile.current = false;
      hasShownError.current = false;
      hasInitialized.current = false;
      isSigningOut.current = false;
      clearTimeouts();
      
      // Redirect to home page after sign out
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    }
  };

  const canGenerate = () => {
    if (!state.user) return false;
    
    // Check if user has active subscription
    if (state.subscription?.subscription_status === 'active') {
      return state.user.credits_remaining > 0;
    }
    
    // Free tier logic
    const today = new Date().toISOString().split('T')[0];
    const lastGenDate = state.user.last_generation_date?.split('T')[0];
    
    if (lastGenDate !== today) {
      return true; // New day, reset count
    }
    return state.user.daily_generations < 3;
  };

  const getRemainingGenerations = () => {
    if (!state.user) return 0;
    
    // Check if user has active subscription
    if (state.subscription?.subscription_status === 'active') {
      return state.user.credits_remaining;
    }
    
    // Free tier logic
    const today = new Date().toISOString().split('T')[0];
    const lastGenDate = state.user.last_generation_date?.split('T')[0];
    
    if (lastGenDate !== today) {
      return 3; // New day
    }
    return Math.max(0, 3 - state.user.daily_generations);
  };

  const getUserTier = () => {
    if (state.subscription?.subscription_status === 'active') {
      return 'pro';
    }
    return 'free';
  };

  const refetchUser = () => {
    if (state.user && !isFetchingProfile.current && isTabVisible.current) {
      debugLog('Refetching user data');
      fetchUserProfile(state.user.id);
    }
  };

  return {
    user: state.user,
    loading: state.loading,
    subscription: state.subscription,
    error: state.error,
    authStep: state.authStep,
    signOut,
    canGenerate,
    getRemainingGenerations,
    getUserTier,
    refetchUser
  };
};