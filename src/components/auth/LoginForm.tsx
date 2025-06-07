import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { GoogleSignInButton } from './GoogleSignInButton';
import toast from 'react-hot-toast';

interface LoginFormProps {
  onSwitchToSignup: () => void;
  onSuccess?: () => void;
}

interface LoginState {
  email: string;
  password: string;
  showPassword: boolean;
  isLoading: boolean;
  error: string | null;
  step: string;
  validationErrors: {
    email?: string;
    password?: string;
  };
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignup, onSuccess }) => {
  const [state, setState] = useState<LoginState>({
    email: '',
    password: '',
    showPassword: false,
    isLoading: false,
    error: null,
    step: 'idle',
    validationErrors: {}
  });

  // Debug logging
  const debugLog = (step: string, data?: any, error?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[LOGIN DEBUG ${timestamp}] ${step}:`, { data, error });
    setState(prev => ({ ...prev, step }));
  };

  // Validation
  const validateForm = () => {
    const errors: { email?: string; password?: string } = {};
    
    if (!state.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(state.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!state.password) {
      errors.password = 'Password is required';
    } else if (state.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    setState(prev => ({ ...prev, validationErrors: errors }));
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    debugLog('Form submission started', { email: state.email });
    
    if (!validateForm()) {
      debugLog('Form validation failed', state.validationErrors);
      toast.error('Please fix the form errors');
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: null,
      step: 'submitting'
    }));

    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Login timeout - request took too long'));
      }, 8000); // 8 second timeout
    });

    // Create the actual sign-in promise
    const signInPromise = (async () => {
      debugLog('Attempting Supabase sign in');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: state.email,
        password: state.password,
      });

      debugLog('Supabase sign in response received', { 
        hasData: !!data, 
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        error: error?.message 
      });

      return { data, error };
    })();

    try {
      // Race between the actual request and timeout
      const { data, error } = await Promise.race([signInPromise, timeoutPromise]) as any;

      if (error) {
        debugLog('Supabase sign in error', null, error);
        
        let errorMessage = 'Sign in failed';
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Please check your email and confirm your account';
        } else if (error.message.includes('Too many requests')) {
          errorMessage = 'Too many login attempts. Please wait a moment and try again.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Login is taking too long. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
        
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: errorMessage,
          step: 'error'
        }));
        toast.error(errorMessage);
      } else if (data?.user && data?.session) {
        debugLog('Sign in successful', { 
          userId: data.user.id,
          sessionId: data.session.access_token?.slice(0, 10) + '...'
        });
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: null,
          step: 'success'
        }));
        toast.success('Signed in successfully!');
        
        // Close the auth modal and redirect to dashboard
        debugLog('Calling onSuccess callback');
        onSuccess?.();
        
      } else {
        debugLog('Unexpected: no user data returned', data);
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Unexpected error: no user data returned',
          step: 'no_user_data'
        }));
        toast.error('Unexpected error occurred');
      }
    } catch (error: any) {
      debugLog('Unexpected login error', null, error);
      
      let errorMessage = 'An unexpected error occurred';
      if (error.message.includes('timeout')) {
        errorMessage = 'Login timeout. Please check your connection and try again.';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: errorMessage,
        step: 'unexpected_error'
      }));
      toast.error(errorMessage);
    }
  };

  const updateField = (field: keyof Pick<LoginState, 'email' | 'password'>, value: string) => {
    setState(prev => ({ 
      ...prev, 
      [field]: value,
      validationErrors: { ...prev.validationErrors, [field]: undefined },
      error: null
    }));
  };

  // Auto-clear loading state if it gets stuck
  React.useEffect(() => {
    if (state.isLoading) {
      const stuckTimeout = setTimeout(() => {
        debugLog('Clearing stuck loading state');
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Request timed out. Please try again.',
          step: 'stuck_timeout'
        }));
        toast.error('Request timed out. Please try again.');
      }, 12000); // 12 second fallback

      return () => clearTimeout(stuckTimeout);
    }
  }, [state.isLoading]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-gray-200/50">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
          <p className="text-gray-600">Sign in to access your dashboard</p>
          
          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-2 text-xs text-gray-500">
              Debug: {state.step}
            </div>
          )}
        </div>

        {/* Error Display */}
        {state.error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2"
          >
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-red-700 text-sm">{state.error}</span>
              {state.error.includes('timeout') && (
                <div className="mt-2">
                  <button
                    onClick={() => setState(prev => ({ ...prev, error: null, step: 'retry_ready' }))}
                    className="text-xs text-red-600 hover:text-red-800 underline"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Success Display */}
        {state.step === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2"
          >
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            <span className="text-green-700 text-sm">Successfully signed in! Redirecting to dashboard...</span>
          </motion.div>
        )}

        {/* Google Sign In */}
        <div className="mb-6">
          <GoogleSignInButton disabled={state.isLoading} onSuccess={onSuccess} />
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="email"
                type="email"
                value={state.email}
                onChange={(e) => updateField('email', e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  state.validationErrors.email ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your email"
                required
                disabled={state.isLoading}
              />
            </div>
            {state.validationErrors.email && (
              <p className="mt-1 text-sm text-red-600">{state.validationErrors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="password"
                type={state.showPassword ? 'text' : 'password'}
                value={state.password}
                onChange={(e) => updateField('password', e.target.value)}
                className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  state.validationErrors.password ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your password"
                required
                disabled={state.isLoading}
              />
              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                disabled={state.isLoading}
              >
                {state.showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {state.validationErrors.password && (
              <p className="mt-1 text-sm text-red-600">{state.validationErrors.password}</p>
            )}
          </div>

          <motion.button
            whileHover={{ scale: state.isLoading ? 1 : 1.02 }}
            whileTap={{ scale: state.isLoading ? 1 : 0.98 }}
            type="submit"
            disabled={state.isLoading}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {state.isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Signing in...</span>
                {process.env.NODE_ENV === 'development' && (
                  <span className="text-xs opacity-75">({state.step})</span>
                )}
              </>
            ) : (
              <span>Sign In</span>
            )}
          </motion.button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Don't have an account?{' '}
            <button
              onClick={onSwitchToSignup}
              className="text-indigo-600 hover:text-indigo-700 font-semibold"
              disabled={state.isLoading}
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  );
};