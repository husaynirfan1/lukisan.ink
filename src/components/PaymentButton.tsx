import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Mail, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { createCheckoutSession } from '../lib/stripe';
import { stripeProducts } from '../stripe-config';
import toast from 'react-hot-toast';

interface PaymentButtonProps {
  productId: 'creator-plan' | 'add-credits'; // Make this required 
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export const PaymentButton: React.FC<PaymentButtonProps> = ({ 
  productId, // Destructure the new prop
  className = '', 
  children,
  variant = 'primary'
}) => {
  const { user, isEmailVerified, resendVerificationEmail } = useAuth();
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const product = stripeProducts.find(p => p.id === productId);

  if (!product) {
      toast.error('Invalid product selected.');
      console.error(`Product with ID "${productId}" not found.`);
      return;
  }

  const handlePaymentClick = async () => {
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    console.log('[PaymentButton] Debug:', {
      hasUser: !!user,
      isEmailVerified,
      userEmail: user.email
    });

    // CRITICAL: Check email verification status
    if (!isEmailVerified) {
      console.log('[PaymentButton] Email not verified, showing modal');
      setShowVerificationModal(true);
      return;
    }

    // Proceed with payment
    setIsProcessing(true);
    try {
      const { url } = await createCheckoutSession({
        priceId: product.priceId,
        mode: product.mode,
      });

      if (url) {
        window.location.href = url;
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create checkout session');
      console.error('Checkout error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResending(true);
    try {
      await resendVerificationEmail();
    } finally {
      setIsResending(false);
    }
  };

  const baseClasses = variant === 'primary' 
    ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:from-yellow-500 hover:to-orange-600'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200';

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handlePaymentClick}
        disabled={isProcessing}
        className={`flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${baseClasses} ${className}`}
      >
        {isProcessing ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span>Processing...</span>
          </>
        ) : (
          <>

            <span>{children || 'Upgrade to Creator'}</span>
          </>
        )}
      </motion.button>

      {/* Email Verification Modal */}
      <AnimatePresence>
        {showVerificationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowVerificationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-8 shadow-xl border border-gray-200/50 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-orange-100 rounded-xl">
                    <AlertCircle className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Email Verification Required</h3>
                </div>
                <button
                  onClick={() => setShowVerificationModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <div className="mb-6">
                <p className="text-gray-600 mb-4">
                  Please verify your email address before you can make a purchase. This helps us ensure the security of your account and transactions.
                </p>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Mail className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-orange-800">
                        Verification email sent to:
                      </p>
                      <p className="text-sm text-orange-700 font-mono">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleResendVerification}
                  disabled={isResending}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      <span>Resend Verification Email</span>
                    </>
                  )}
                </motion.button>

                <button
                  onClick={() => setShowVerificationModal(false)}
                  className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  I'll verify later
                </button>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500">
                  Check your spam folder if you don't see the email within a few minutes.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};