import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { resendVerificationEmail } from '../lib/emailVerification';

export const VerificationErrorPage: React.FC = () => {
  const [isResending, setIsResending] = React.useState(false);
  
  // Get error reason from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const reason = urlParams.get('reason') || 'unknown';

  const getErrorMessage = () => {
    switch (reason) {
      case 'missing-token':
        return 'The verification link is missing required information. Please try requesting a new verification email.';
      case 'invalid-token':
        return 'This verification link is invalid or has expired. Please request a new verification email.';
      case 'server-error':
        return 'We encountered a server error while verifying your email. Please try again.';
      default:
        return 'An unexpected error occurred during email verification. Please try again.';
    }
  };

  const handleResendEmail = async () => {
    setIsResending(true);
    try {
      await resendVerificationEmail();
    } finally {
      setIsResending(false);
    }
  };

  const handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-pink-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg w-full text-center"
      >
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 shadow-xl border border-gray-200/50">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 bg-gradient-to-br from-red-400 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <AlertTriangle className="h-10 w-10 text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold text-gray-900 mb-4"
          >
            Verification Failed
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-gray-600 mb-8 text-lg"
          >
            {getErrorMessage()}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-3 mb-6"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleResendEmail}
              disabled={isResending}
              className="w-full flex items-center justify-center space-x-2 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  <span>Sending New Email...</span>
                </>
              ) : (
                <>
                  <Mail className="h-5 w-5" />
                  <span>Send New Verification Email</span>
                </>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleGoHome}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Dashboard</span>
            </motion.button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-blue-50 rounded-lg p-4 text-left"
          >
            <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Check your spam/junk folder for the verification email</li>
              <li>• Make sure you're clicking the most recent verification link</li>
              <li>• Verification links expire after 24 hours for security</li>
              <li>• Contact support if you continue having issues</li>
            </ul>
          </div>
            </motion.div>
          </motion.div>
        </div>
      
      </motion.div>
    
    </div>
  );
};