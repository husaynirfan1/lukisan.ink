import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, User } from '../lib/supabase';
import { getUserSubscription } from '../lib/stripe';
import toast from 'react-hot-toast';

interface AuthFlowState {
  user: User | null;
  loading: boolean;
  subscription: any;
  error: string | null;
  authStep: string;
  connectionHealth: boolean;
  retryCount: number;
}

interface AuthFlowConfig {
  maxRetries: number;
  timeoutMs: number;
  enableOfflineSupport: boolean;
  enablePerformanceTracking: boolean;
}

const DEFAULT_CONFIG: AuthFlowConfig = {
  maxRetries: 3,
  timeoutMs: 15000,
  enableOfflineSupport: true,
  enablePerformanceTracking: true,
};

export const useAuthFlow = (config: Partial<AuthFlowConfig> = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [state, setState] = useState<AuthFlowState>({
    user: null,
    loading: true,
    subscription: null,
    error: null,
    authStep: 'initializing',
    connectionHealth: true,
    retryCount: 0,
  });

  // Refs for operation control
  const isInitializing = useRef(false);
  const isFetchingProfile = useRef(false);
  const isSigningOut = useRef(false);
  const hasInitialized = useRef(false);
  const operationTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const performanceMarks = useRef<Map<string, number>>(new Map());

  // Performance tracking
  const startPerformanceTracking = useCallback((operation: string) => {
    if (finalConfig.enablePerformanceTracking) {
      performanceMarks.current.set(operation, Date.now());
    }
  }, [finalConfig.enablePerformanceTracking]);

  const endPerformanceTracking = useCallback((operation: string) => {
    if (finalConfig.enablePerformanceTracking) {
      const startTime = performanceMarks.current.get(operation);
      if (startTime) {
        const duration = Date.now() - startTime;
        console.log(`[AUTH PERF] ${operation}: ${duration}ms`);
        
        if (duration > 5000) {
          console.warn(`[AUTH PERF] Slow operation: ${operation} took ${duration}ms`);
        }
        
        performanceMarks.current.delete(operation);
      }
    }
  }, [finalConfig.enablePerformanceTracking]);

  // Enhanced debug logging
  const debugLog = useCallback((step: string, data?: any, error?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[AUTH FLOW ${timestamp}] ${step}:`, { 
      data, 
      error, 
      connectionHealth: state.connectionHealth,
      retryCount: state.retryCount 
    });
    
    setState(prev => ({ ...prev, authStep: step }));
  }, [state.connectionHealth, state.retryCount]);

  // Connection health monitoring
  const checkConnectionHealth = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('users').select('count').limit(1);
      const isHealthy = !error;
      
      setState(prev => ({ ...prev, connectionHealth: isHealthy }));
      return isHealthy;
    } catch {
      setState(prev => ({ ...prev, connectionHealth: false }));
      return false;
    }
  }, []);

  // Enhanced retry mechanism with exponential backoff
  const retryOperation = useCallback(async <T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = finalConfig.maxRetries
  ): Promise<T> => {
    let lastError: Error;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        debugLog(`${operationName} attempt ${attempt + 1}/${maxRetries}`);
        
        // Check connection health before retry
        if (attempt > 0) {
          const isHealthy = await checkConnectionHealth();
          if (!isHealthy) {
            throw new Error('Connection unhealthy, skipping retry');
          }
        }
        
        const result = await operation();
        
        if (attempt > 0) {
          debugLog(`${operationName} succeeded after ${attempt + 1} attempts`);
          setState(prev => ({ ...prev, retryCount: 0 }));
        }
        
        return result;
      } catch (error: any) {
        lastError = error;
        debugLog(`${operationName} attempt ${attempt + 1} failed`, null, error);
        
        setState(prev => ({ ...prev, retryCount: attempt + 1 }));
        
        if (attempt < maxRetries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          debugLog(`Retrying ${operationName} in ${backoffMs}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    throw lastError!;
  }, [finalConfig.maxRetries, debugLog, checkConnectionHealth]);

  // Enhanced session validation
  const validateSession = useCallback(async (session: any): Promise<boolean> => {
    if (!session?.access_token) return false;
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
      return !error && !!user;
    } catch {
      return false;
    }
  }, []);

  // Clear operation timeouts
  const clearOperationTimeout = useCallback((operationName: string) => {
    const timeout = operationTimeouts.current.get(operationName);
    if (timeout) {
      clearTimeout(timeout);
      operationTimeouts.current.delete(operationName);
    }
  }, []);

  // Set operation timeout
  const setOperationTimeout = useCallback((
    operationName: string, 
    callback: () => void, 
    timeoutMs = finalConfig.timeoutMs
  ) => {
    clearOperationTimeout(operationName);
    
    const timeout = setTimeout(() => {
      debugLog(`${operationName} timeout reached`);
      callback();
    }, timeoutMs);
    
    operationTimeouts.current.set(operationName, timeout);
  }, [finalConfig.timeoutMs, clearOperationTimeout, debugLog]);

  // Enhanced profile fetching with retry logic
  const fetchUserProfile = useCallback(async (userId: string) => {
    if (isFetchingProfile.current) {
      debugLog('Profile fetch already in progress, skipping');
      return;
    }

    isFetchingProfile.current = true;
    startPerformanceTracking('fetchUserProfile');
    
    setOperationTimeout('fetchUserProfile', () => {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Profile fetch timeout',
        authStep: 'profile_fetch_timeout'
      }));
      isFetchingProfile.current = false;
    });

    try {
      debugLog('Starting profile fetch', { userId });
      setState(prev => ({ ...prev, loading: true, authStep: 'fetching_profile' }));
      
      // Fetch user profile with retry
      const { data: existingUser, error: fetchError } = await retryOperation(
        () => supabase.from('users').select('*').eq('id', userId).maybeSingle(),
        'fetchUserProfile'
      );

      if (fetchError) {
        throw new Error(`Profile fetch failed: ${fetchError.message}`);
      }

      // Create profile if doesn't exist
      if (!existingUser) {
        debugLog('Creating new user profile');
        
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !authUser) {
          throw new Error('Failed to get auth user information');
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

        const { data: createdUser, error: createError } = await retryOperation(
          () => supabase.from('users').insert(newUserData).select().single(),
          'createUserProfile'
        );

        if (createError) {
          throw new Error(`Profile creation failed: ${createError.message}`);
        }

        setState(prev => ({ ...prev, user: createdUser, authStep: 'profile_created' }));
        toast.success('Account created successfully!');
      } else {
        setState(prev => ({ ...prev, user: existingUser, authStep: 'profile_loaded' }));
      }
      
      // Fetch subscription data (non-blocking)
      try {
        const sub = await getUserSubscription();
        setState(prev => ({ 
          ...prev, 
          subscription: sub,
          loading: false,
          error: null,
          authStep: 'complete'
        }));
      } catch (subError: any) {
        debugLog('Subscription fetch error (non-critical)', null, subError);
        setState(prev => ({ 
          ...prev, 
          loading: false,
          error: null,
          authStep: 'complete_no_subscription'
        }));
      }
      
    } catch (error: any) {
      debugLog('Profile fetch failed', null, error);
      
      let errorMessage = 'Failed to load user profile';
      if (error.message.includes('timeout')) {
        errorMessage = 'Profile loading timed out. Please refresh the page.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: errorMessage,
        authStep: 'profile_fetch_error'
      }));
      
      toast.error(errorMessage);
    } finally {
      isFetchingProfile.current = false;
      clearOperationTimeout('fetchUserProfile');
      endPerformanceTracking('fetchUserProfile');
    }
  }, [retryOperation, debugLog, setOperationTimeout, clearOperationTimeout, startPerformanceTracking, endPerformanceTracking]);

  // Enhanced sign out with retry logic
  const signOut = useCallback(async () => {
    if (isSigningOut.current) {
      debugLog('Sign out already in progress, skipping');
      return;
    }

    isSigningOut.current = true;
    startPerformanceTracking('signOut');

    try {
      debugLog('Starting sign out');
      setState(prev => ({ ...prev, loading: true, authStep: 'signing_out' }));
      
      setOperationTimeout('signOut', () => {
        debugLog('Sign out timeout, forcing local state reset');
        setState({
          user: null,
          subscription: null,
          loading: false,
          error: null,
          authStep: 'signed_out_timeout',
          connectionHealth: true,
          retryCount: 0,
        });
        toast.success('Signed out (timeout)');
        isSigningOut.current = false;
        
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      }, 10000);

      const { error } = await retryOperation(
        () => supabase.auth.signOut(),
        'signOut',
        2 // Fewer retries for sign out
      );
      
      clearOperationTimeout('signOut');

      if (error) {
        debugLog('Sign out error', null, error);
        
        // Handle specific error cases
        if (error.message.includes('Session from session_id claim in JWT does not exist') || 
            error.message.includes('session_not_found') ||
            error.message.includes('Invalid JWT') ||
            error.message.includes('JWT expired')) {
          debugLog('Session already invalid, treating as successful signout');
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
      // Always reset client-side state
      debugLog('Resetting client-side auth state');
      setState({
        user: null,
        subscription: null,
        loading: false,
        error: null,
        authStep: 'signed_out',
        connectionHealth: true,
        retryCount: 0,
      });
      
      // Reset refs
      isInitializing.current = false;
      isFetchingProfile.current = false;
      isSigningOut.current = false;
      hasInitialized.current = false;
      
      // Clear all timeouts
      operationTimeouts.current.forEach(timeout => clearTimeout(timeout));
      operationTimeouts.current.clear();
      
      endPerformanceTracking('signOut');
      
      // Redirect after sign out
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    }
  }, [retryOperation, debugLog, setOperationTimeout, clearOperationTimeout, startPerformanceTracking, endPerformanceTracking]);

  // Initialize authentication
  useEffect(() => {
    if (isInitializing.current || hasInitialized.current) {
      debugLog('Already initialized or initializing, skipping');
      return;
    }

    isInitializing.current = true;
    hasInitialized.current = true;
    startPerformanceTracking('initializeAuth');
    
    debugLog('Starting auth initialization');
    
    setOperationTimeout('initializeAuth', () => {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Authentication timeout',
        authStep: 'timeout'
      }));
      toast.error('Authentication is taking longer than expected. Please refresh the page.');
      isInitializing.current = false;
    }, 25000);

    const initializeAuth = async () => {
      try {
        debugLog('Getting initial session');
        
        const { data: { session }, error } = await retryOperation(
          () => supabase.auth.getSession(),
          'getInitialSession'
        );
        
        if (error) {
          throw new Error(`Session error: ${error.message}`);
        }

        if (session?.user) {
          debugLog('Initial session found', { userId: session.user.id });
          
          // Validate session before proceeding
          const isValid = await validateSession(session);
          if (!isValid) {
            throw new Error('Session validation failed');
          }
          
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
        toast.error('Failed to initialize authentication');
      } finally {
        isInitializing.current = false;
        clearOperationTimeout('initializeAuth');
        endPerformanceTracking('initializeAuth');
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        debugLog('Auth state change', { event, userId: session?.user?.id });
        
        if (isInitializing.current) {
          debugLog('Skipping auth state change - still initializing');
          return;
        }
        
        try {
          if (session?.user) {
            const isValid = await validateSession(session);
            if (isValid) {
              debugLog('Valid user session detected, fetching profile');
              await fetchUserProfile(session.user.id);
            } else {
              debugLog('Invalid session detected, signing out');
              await signOut();
            }
          } else {
            debugLog('No user session, clearing state');
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
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      operationTimeouts.current.forEach(timeout => clearTimeout(timeout));
      operationTimeouts.current.clear();
      isInitializing.current = false;
    };
  }, []);

  // Connection health monitoring
  useEffect(() => {
    if (!finalConfig.enableOfflineSupport) return;

    const interval = setInterval(checkConnectionHealth, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [finalConfig.enableOfflineSupport, checkConnectionHealth]);

  // Utility functions
  const canGenerate = useCallback(() => {
    if (!state.user) return false;
    
    if (state.subscription?.subscription_status === 'active') {
      return state.user.credits_remaining > 0;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const lastGenDate = state.user.last_generation_date?.split('T')[0];
    
    if (lastGenDate !== today) {
      return true;
    }
    return state.user.daily_generations < 3;
  }, [state.user, state.subscription]);

  const getRemainingGenerations = useCallback(() => {
    if (!state.user) return 0;
    
    if (state.subscription?.subscription_status === 'active') {
      return state.user.credits_remaining;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const lastGenDate = state.user.last_generation_date?.split('T')[0];
    
    if (lastGenDate !== today) {
      return 3;
    }
    return Math.max(0, 3 - state.user.daily_generations);
  }, [state.user, state.subscription]);

  const getUserTier = useCallback(() => {
    if (state.subscription?.subscription_status === 'active') {
      return 'pro';
    }
    return 'free';
  }, [state.subscription]);

  const refetchUser = useCallback(() => {
    if (state.user && !isFetchingProfile.current) {
      debugLog('Refetching user data');
      fetchUserProfile(state.user.id);
    }
  }, [state.user, fetchUserProfile, debugLog]);

  return {
    ...state,
    signOut,
    canGenerate,
    getRemainingGenerations,
    getUserTier,
    refetchUser,
    checkConnectionHealth,
  };
};