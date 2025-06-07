import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface CallbackState {
  status: 'loading' | 'success' | 'error';
  message: string;
  step: string;
}

export const AuthCallback: React.FC = () => {
  const [state, setState] = useState<CallbackState>({
    status: 'loading',
    message: 'Processing authentication...',
    step: 'initializing'
  });

  // Debug logging
  const debugLog = (step: string, data?: any, error?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[AUTH CALLBACK DEBUG ${timestamp}] ${step}:`, { data, error });
    setState(prev => ({ ...prev, step }));
  };

  useEffect(() => {
    const handleAuthCallback = async () => {
      debugLog('Auth callback started');
      
      // Add timeout for slow callback processing
      const callbackTimeout = setTimeout(() => {
        debugLog('Callback timeout reached');
        setState({
          status: 'error',
          message: 'Authentication is taking longer than expected. Redirecting...',
          step: 'timeout'
        });
        toast.error('Authentication timeout');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 2000);
      }, 20000); // 20 second timeout

      try {
        debugLog('Getting session from callback');
        setState(prev => ({ 
          ...prev, 
          message: 'Verifying authentication...',
          step: 'verifying'
        }));

        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          debugLog('Session error in callback', null, error);
          clearTimeout(callbackTimeout);
          setState({
            status: 'error',
            message: 'Authentication failed. Please try again.',
            step: 'session_error'
          });
          toast.error('Authentication failed');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 3000);
          return;
        }

        if (data.session?.user) {
          const user = data.session.user;
          debugLog('User session found in callback', { userId: user.id });
          
          setState(prev => ({ 
            ...prev, 
            message: 'Setting up your profile...',
            step: 'profile_setup'
          }));

          // Check if user profile exists
          debugLog('Checking for existing profile');
          const { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

          if (fetchError) {
            debugLog('Error checking user profile', null, fetchError);
            // Don't fail the whole flow for this error
          }

          // Create user profile if it doesn't exist
          if (!existingUser) {
            debugLog('Creating new user profile');
            setState(prev => ({ 
              ...prev, 
              message: 'Creating your profile...',
              step: 'creating_profile'
            }));

            const newUserData = {
              id: user.id,
              email: user.email!,
              name: user.user_metadata?.full_name || 
                    user.user_metadata?.name || 
                    user.email!.split('@')[0],
              avatar_url: user.user_metadata?.avatar_url || 
                         user.user_metadata?.picture,
              tier: 'free',
              credits_remaining: 0,
              daily_generations: 0,
            };

            const { error: profileError } = await supabase
              .from('users')
              .insert(newUserData);

            if (profileError) {
              debugLog('Profile creation error', null, profileError);
              // Don't fail the whole flow - the useAuth hook will handle this
              console.warn('Profile creation failed, but continuing with auth');
            } else {
              debugLog('Profile created successfully');
            }
          } else {
            debugLog('Existing profile found');
          }

          clearTimeout(callbackTimeout);
          setState({
            status: 'success',
            message: 'Successfully signed in! Redirecting to dashboard...',
            step: 'success'
          });
          toast.success('Successfully signed in!');
          
          // Redirect directly to dashboard after a short delay
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 2000);
        } else {
          debugLog('No user session found in callback');
          clearTimeout(callbackTimeout);
          setState({
            status: 'error',
            message: 'No user session found. Please try signing in again.',
            step: 'no_session'
          });
          toast.error('Authentication failed - no session');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 3000);
        }
      } catch (error) {
        debugLog('Unexpected callback error', null, error);
        clearTimeout(callbackTimeout);
        setState({
          status: 'error',
          message: 'An unexpected error occurred. Please try again.',
          step: 'unexpected_error'
        });
        toast.error('Authentication failed');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 3000);
      }
    };

    handleAuthCallback();
  }, []);

  const getIcon = () => {
    switch (state.status) {
      case 'loading':
        return <Loader2 className="h-12 w-12 animate-spin text-indigo-600" />;
      case 'success':
        return <CheckCircle className="h-12 w-12 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-12 w-12 text-red-600" />;
    }
  };

  const getBackgroundColor = () => {
    switch (state.status) {
      case 'loading':
        return 'from-slate-50 to-gray-100';
      case 'success':
        return 'from-green-50 to-emerald-100';
      case 'error':
        return 'from-red-50 to-pink-100';
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${getBackgroundColor()} flex items-center justify-center`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-gray-200/50 max-w-md">
          <motion.div
            key={state.status}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="mb-4 flex justify-center"
          >
            {getIcon()}
          </motion.div>
          
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {state.status === 'loading' && 'Completing sign in...'}
            {state.status === 'success' && 'Welcome!'}
            {state.status === 'error' && 'Authentication Failed'}
          </h2>
          
          <p className="text-gray-600 mb-4">{state.message}</p>
          
          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-500 mt-4 p-2 bg-gray-100 rounded">
              Debug: {state.step}
            </div>
          )}
          
          {state.status === 'error' && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              onClick={() => window.location.href = '/dashboard'}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Return to Dashboard
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
};