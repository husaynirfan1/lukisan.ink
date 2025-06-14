import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// --- CHANGE 1: Import CreditCard ---
import { Crown, Mail, AlertCircle, X, CreditCard } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { createCheckoutSession } from '../lib/stripe';
import { stripeProducts } from '../stripe-config';
import toast from 'react-hot-toast';

interface PaymentButtonProps {
  // Using actual Stripe Product IDs for type safety
  productId: 'prod_SSwR3x2OKd1ISe' | 'prod_SUxt63tLx3WTzh';
  className?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export const PaymentButton: React.FC<PaymentButtonProps> = ({
  productId,
  className = '',
  children,
  variant = 'primary'
}) => {
  const { user, isEmailVerified, resendVerificationEmail } = useAuth();
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // --- CHANGE 2: Define a boolean for the specific product ---
  // Replace 'prod_SUxt63tLx3WTzh' with your actual product ID for credits
  const isCreditProduct = productId === 'prod_SUxt63tLx3WTzh';

  const product = stripeProducts.find(p => p.id === productId);

  // This check remains the same
  if (!product) {
    // Return a visible error or null instead of just logging
    return <button className="px-6 py-3 rounded-xl bg-red-100 text-red-700" disabled>Invalid Product</button>;
  }

  const handlePaymentClick = async () => {
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    if (!isEmailVerified) {
      setShowVerificationModal(true);
      return;
    }

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
  
  // --- CHANGE 3: Update styling logic to check for the credit product ---
  const baseClasses = isCreditProduct
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : variant === 'primary'
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
        ) : // --- CHANGE 4: Conditionally render the button content ---
        isCreditProduct ? (
          <>
            <CreditCard className="h-5 w-5" />
            <span>Add Credits</span>
          </>
        ) : (
          // Fallback to children for other buttons like "Upgrade"
          children || (
            <>
              <Crown className="h-5 w-5" />
              <span>Upgrade to Creator</span>
            </>
          )
        )}
      </motion.button>

      {/* Email Verification Modal remains the same */}
      <AnimatePresence>
        {showVerificationModal && (
          // ... modal JSX ...
        )}
      </AnimatePresence>
    </>
  );
};