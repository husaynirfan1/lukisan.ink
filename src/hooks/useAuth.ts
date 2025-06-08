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
  authInitialized: boolean; // <-- ADD THIS LINE
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    subscription: null,
    error: null,
    authStep: 'initializing',
    authInitialized: false, // <-- ADD THIS LINE
  });

  const isFetchingProfile = useRef(false);
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSuccessfulFetchTimestamp = useRef<number>(0);
  const hasAttemptedGuestImageTransfer = useRef(false);

  // Simple debug logger
  const debugLog = (step: string, data: any = {}) => {
    console.log(`[AUTH] ${new Date().toISOString()} | ${step}`, data);
  };

  const fetchUserProfile = useCallback(async (userId: string, isInitialLoad = false) => {
    // 1. Primary Guard: Prevent concurrent fetches
    if (isFetchingProfile.current) {
      debugLog('fetchUserProfile_skipped', { reason: 'Already fetching' });
      return;
    }

    debugLog('fetchUserProfile_start', { userId });
    isFetchingProfile.current = true;
    setState(prev => ({ ...prev, loading: true, error: null, authStep: 'fetching_profile' }));

    // This single timeout will govern the entire fetch process
    const operationTimeout = setTimeout(() => {
        debugLog('fetchUserProfile_timeout');
        isFetchingProfile.current = false;
        setState(prev => ({
            ...prev,
            loading: false,
            error: 'Profile loading took too long. Please refresh the page.',
            authStep: 'profile_fetch_timeout'
        }));
    }, AUTH_FLOW_TIMEOUT_MS);

    try {
      // 2. Fetch user profile from 'users' table
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') { // Ignore 'PGRST116' (no rows found)
        throw new Error(`Profile fetch error: ${profileError.message}`);
      }

      let finalUserProfile = userProfile;

      // 3. If profile doesn't exist, create it
      if (!finalUserProfile) {
        debugLog('fetchUserProfile_creating_profile');
        setState(prev => ({ ...prev, authStep: 'creating_profile' }));
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) throw new Error('Could not get authenticated user to create profile.');

        const newUserData = {
            id: userId,
            email: authUser.email!,
            name: authUser.user_metadata?.full_name || authUser.email!.split('@')[0],
            avatar_url: authUser.user_metadata?.avatar_url,
        };

        const { data: createdUser, error: createError } = await supabase
            .from('users')
            .insert(newUserData)
            .select()
            .single();

        if (createError) throw new Error(`Profile creation failed: ${createError.message}`);
        
        finalUserProfile = createdUser;
        toast.success('Account created successfully!');
      }

      // 4. Handle Guest Image Transfer (only once per session)
      if (!hasAttemptedGuestImageTransfer.current) {
        debugLog('fetchUserProfile_transferring_images');
        const transferResult = await transferTempImagesToUser(userId);
        if (transferResult.success) {
            hasAttemptedGuestImageTransfer.current = true;
            if (transferResult.transferredCount > 0) {
                toast.success(`Transferred ${transferResult.transferredCount} guest image(s) to your account.`);
            }
            await clearGuestSession();
        }
      }

      // 5. Fetch subscription status
      debugLog('fetchUserProfile_fetching_subscription');
      setState(prev => ({ ...prev, authStep: 'loading_subscription' }));
      const subscription = await getUserSubscription();

      // 6. Success: Update state
      debugLog('fetchUserProfile_success');
      lastSuccessfulFetchTimestamp.current = Date.now();
      setState({
          user: finalUserProfile,
          subscription: subscription,
          loading: false,
          error: null,
          authStep: 'complete'
      });

    } catch (error: any) {
      debugLog('fetchUserProfile_error', { errorMessage: error.message });
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'An unknown error occurred while fetching your profile.',
        authStep: 'profile_fetch_error'
      }));
    } finally {
      // 7. Cleanup: always clear timeout and reset fetching flag
      clearTimeout(operationTimeout);
      isFetchingProfile.current = false;
    }
  }, []);


  const signOut = async () => {
    debugLog('signOut_start');
    await supabase.auth.signOut();
    // The onAuthStateChange listener will handle the state reset.
    // We also clear refs and state here as a fallback.
    hasAttemptedGuestImageTransfer.current = false;
    lastSuccessfulFetchTimestamp.current = 0;
    setState({ user: null, loading: false, subscription: null, error: null, authStep: 'signed_out' });
    window.location.href = '/'; // Force a clean reload to the home page
  };


// Main effect for handling initialization and auth state changes
useEffect(() => {
    debugLog('Auth effect initializing...');
    let isMounted = true;

    const safetyTimeout = setTimeout(() => {
        if (isMounted && !state.authInitialized) { // Check if not already initialized
            debugLog('Auth check timed out. Assuming no session.');
            setState(prev => ({ ...prev, loading: false, authInitialized: true, authStep: 'no_session_found_timeout' }));
        }
    }, 3500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
            clearTimeout(safetyTimeout);
            if (!isMounted) return;

            if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
                debugLog('User session detected.', { event });
                setState(prev => ({...prev, authInitialized: true})); // <-- SET INITIALIZED, THEN FETCH
                fetchUserProfile(session.user.id);
            } else if (event === 'SIGNED_OUT') {
                debugLog('User signed out.');
                setState({ ...state, user: null, loading: false, subscription: null, error: null, authStep: 'signed_out', authInitialized: true }); // <-- SET INITIALIZED
            } else if (!session?.user) {
                debugLog('No user session detected.');
                setState(prev => ({ ...prev, loading: false, authInitialized: true, authStep: 'no_session' })); // <-- SET INITIALIZED
            }
        }
    );

    return () => {
        isMounted = false;
        debugLog('Auth effect cleanup');
        subscription.unsubscribe();
        clearTimeout(safetyTimeout);
    };
}, [fetchUserProfile, state.authInitialized]); // Added state.authInitialized to dependencies


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
        fetchUserProfile(state.user.id)
    }
  }

return {
    user: state.user,
    loading: state.loading,
    subscription: state.subscription,
    error: state.error,
    authStep: state.authStep,
    authInitialized: state.authInitialized, // <-- ADD THIS LINE
    signOut,
    canGenerate,
    getRemainingGenerations,
    getUserTier,
    refetchUser
  };
};