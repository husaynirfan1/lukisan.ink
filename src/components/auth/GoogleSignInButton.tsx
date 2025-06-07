import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  disabled?: boolean;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ 
  onSuccess, 
  disabled = false 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug logging
  const debugLog = (step: string, data?: any, error?: any) => {
    const timestamp = new Date().toISOString();
    console.log(`[GOOGLE AUTH DEBUG ${timestamp}] ${step}:`, { data, error });
  };

  const handleGoogleSignIn = async () => {
    if (disabled || isLoading) return;
    
    setIsLoading(true);
    setError(null);
    debugLog('Google sign-in initiated');
    
    // Add timeout for slow responses
    const googleTimeout = setTimeout(() => {
      if (isLoading) {
        debugLog('Google sign-in timeout');
        setIsLoading(false);
        setError('Google sign-in is taking longer than expected');
        toast.error('Google sign-in timeout. Please try again.');
      }
    }, 10000); // 10 second timeout
    
    try {
      debugLog('Calling Supabase OAuth');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      clearTimeout(googleTimeout);

      if (error) {
        debugLog('Google OAuth error', null, error);
        
        let errorMessage = 'Google sign-in failed';
        if (error.message.includes('popup')) {
          errorMessage = 'Please allow popups for Google sign-in';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
        
        setError(errorMessage);
        toast.error(errorMessage);
      } else {
        debugLog('Google OAuth initiated successfully', data);
        // The redirect will happen automatically
        // onSuccess will be called after redirect in the auth callback
        toast.success('Redirecting to Google...');
        
        // For OAuth, we don't call onSuccess here since it redirects
        // The callback will handle the success case
      }
    } catch (error) {
      clearTimeout(googleTimeout);
      debugLog('Unexpected Google sign-in error', null, error);
      const errorMessage = 'Failed to initiate Google sign-in';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <motion.button
        whileHover={{ scale: (disabled || isLoading) ? 1 : 1.02 }}
        whileTap={{ scale: (disabled || isLoading) ? 1 : 0.98 }}
        onClick={handleGoogleSignIn}
        disabled={disabled || isLoading}
        className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
        ) : (
          <>
            <svg
              className="h-5 w-5 mr-3"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="text-gray-700 font-medium">Continue with Google</span>
          </>
        )}
      </motion.button>
      
      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2"
        >
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <span className="text-red-700 text-sm">{error}</span>
        </motion.div>
      )}
    </div>
  );
};