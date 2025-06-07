import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { GoogleSignInButton } from './GoogleSignInButton';
import toast from 'react-hot-toast';

interface SignupFormProps {
  onSwitchToLogin: () => void;
  onSuccess?: () => void;
}

interface SignupState {
  email: string;
  password: string;
  name: string;
  showPassword: boolean;
  isLoading: boolean;
  error: string | null;
  step: string;
  validationErrors: {
    email?: string;
    password?: string;
    name?: string;
  };
}

export const SignupForm: React.FC<SignupFormProps> = ({ onSwitchToLogin, onSuccess }) => {
  const [state, setState] = useState<SignupState>({
    email: '',
    password: '',
    name: '',
    showPassword: false,
    isLoading: false,
    error: null,
    step: 'idle',
    validationErrors: {}
  });

  // Debug logging
  const debugLog = (step: string, data?: any, error?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[SIGNUP DEBUG ${timestamp}] ${step}:`, { data, error });
    setState(prev => ({ ...prev, step }));
  };

  // Validation
  const validateForm = () => {
    const errors: { email?: string; password?: string; name?: string } = {};
    
    if (!state.name.trim()) {
      errors.name = 'Name is required';
    } else if (state.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }
    
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
    
    debugLog('Signup form submission started', { 
      email: state.email, 
      name: state.name 
    });
    
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

    // Add timeout for slow responses
    const signupTimeout = setTimeout(() => {
      if (state.isLoading) {
        debugLog('Signup timeout reached');
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Signup is taking longer than expected. Please try again.',
          step: 'timeout'
        }));
        toast.error('Signup timeout. Please try again.');
      }
    }, 15000); // 15 second timeout for signup

    try {
      debugLog('Attempting Supabase sign up');
      
      const { data, error } = await supabase.auth.signUp({
        email: state.email,
        password: state.password,
        options: {
          data: {
            name: state.name.trim(),
            full_name: state.name.trim(),
          },
        },
      });

      clearTimeout(signupTimeout);

      if (error) {
        debugLog('Supabase sign up error', null, error);
        
        let errorMessage = 'Account creation failed';
        if (error.message.includes('User already registered')) {
          errorMessage = 'An account with this email already exists. Please sign in instead.';
        } else if (error.message.includes('Password should be at least')) {
          errorMessage = 'Password must be at least 6 characters long';
        } else if (error.message.includes('Invalid email')) {
          errorMessage = 'Please enter a valid email address';
        } else if (error.message.includes('Signup is disabled')) {
          errorMessage = 'Account creation is currently disabled. Please contact support.';
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
      } else if (data.user) {
        debugLog('Sign up successful', { userId: data.user.id });
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: null,
          step: 'success'
        }));
        toast.success('Account created successfully!');
        
        // Close the auth modal and redirect to dashboard
        debugLog('Calling onSuccess callback');
        onSuccess?.();
        
      } else {
        debugLog('Unexpected: no user data returned');
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Unexpected error: no user data returned',
          step: 'no_user_data'
        }));
        toast.error('Unexpected error occurred');
      }
    } catch (error: any) {
      clearTimeout(signupTimeout);
      debugLog('Unexpected signup error', null, error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'An unexpected error occurred',
        step: 'unexpected_error'
      }));
      toast.error('An unexpected error occurred');
    }
  };

  const updateField = (field: keyof Pick<SignupState, 'email' | 'password' | 'name'>, value: string) => {
    setState(prev => ({ 
      ...prev, 
      [field]: value,
      validationErrors: { ...prev.validationErrors, [field]: undefined },
      error: null
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-gray-200/50">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h2>
          <p className="text-gray-600">Join Lukisan.ink and start creating</p>
          
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
            <span className="text-red-700 text-sm">{state.error}</span>
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
            <span className="text-green-700 text-sm">Account created successfully! Redirecting to dashboard...</span>
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
            <span className="px-2 bg-white text-gray-500">Or create account with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="name"
                type="text"
                value={state.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                  state.validationErrors.name ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your full name"
                required
                disabled={state.isLoading}
              />
            </div>
            {state.validationErrors.name && (
              <p className="mt-1 text-sm text-red-600">{state.validationErrors.name}</p>
            )}
          </div>

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
                placeholder="Create a password"
                required
                minLength={6}
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
            <p className="text-sm text-gray-500 mt-1">Must be at least 6 characters</p>
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
                <span>Creating account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </motion.button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-indigo-600 hover:text-indigo-700 font-semibold"
              disabled={state.isLoading}
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  );
};