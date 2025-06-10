import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export const EmailVerificationPage: React.FC = () => {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get the hash from URL
        const hash = window.location.hash;
        
        if (!hash) {
          setStatus('error');
          setMessage('No verification token found in URL');
          return;
        }

        // Parse the hash to get access_token and refresh_token
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');

        if (type !== 'signup' && type !== 'email_change') {
          setStatus('error');
          setMessage('Invalid verification type');
          return;
        }

        if (!accessToken) {
          setStatus('error');
          setMessage('Invalid verification link');
          return;
        }

        // Set the session with the tokens from the URL
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (error) {
          console.error('Error setting session:', error);
          setStatus('error');
          setMessage('Failed to verify email. Please try again.');
          return;
        }

        if (data.user) {
          // Update the user's verification status in our custom users table
          const { error: updateError } = await supabase
            .from('users')
            .update({ is_email_verified: true })
            .eq('id', data.user.id);

          if (updateError) {
            console.error('Error updating verification status:', updateError);
          }

          // Refresh the user data in context
          await refreshUser();

          setStatus('success');
          setMessage('Email verified successfully!');

          // Redirect to dashboard after a delay
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Failed to verify email. Please try again.');
        }
      } catch (error) {
        console.error('Verification error:', error);
        setStatus('error');
        setMessage('An unexpected error occurred during verification.');
      }
    };

    verifyEmail();
  }, [refreshUser]);

  const getIcon = () => {
    switch (status) {
      case 'verifying':
        return <Loader2 className="h-16 w-16 animate-spin text-indigo-600" />;
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-16 w-16 text-red-600" />;
    }
  };

  const getBackgroundColor = () => {
    switch (status) {
      case 'verifying':
        return 'from-slate-50 to-gray-100';
      case 'success':
        return 'from-green-50 to-emerald-100';
      case 'error':
        return 'from-red-50 to-pink-100';
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${getBackgroundColor()} flex items-center justify-center px-4`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md w-full"
      >
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-gray-200/50">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="mb-6 flex justify-center"
          >
            {getIcon()}
          </motion.div>

          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {status === 'verifying' && 'Verifying Email'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </h1>

          <p className="text-gray-600 mb-6">{message}</p>

          {status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 text-sm">
                You can now make purchases and access all features. Redirecting to dashboard...
              </p>
            </div>
          )}

          {status === 'error' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.href = '/dashboard'}
              className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors mx-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Dashboard</span>
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
};