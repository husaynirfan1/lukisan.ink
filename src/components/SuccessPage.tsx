import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Crown, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { stripeProducts } from '../stripe-config';

export const SuccessPage: React.FC = () => {
  const { refetchUser } = useAuth();

  useEffect(() => {
    // Refetch user data to get updated subscription status
    const timer = setTimeout(() => {
      refetchUser();
    }, 2000);

    return () => clearTimeout(timer);
  }, [refetchUser]);

  const product = stripeProducts[0]; // Pro product

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center px-4">
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
            className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="h-10 w-10 text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl font-bold text-gray-900 mb-4"
          >
            Payment Successful!
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-gray-600 mb-8 text-lg"
          >
            Thank you for subscribing to {product.name}! Your account has been upgraded and you now have access to 30 AI logo and video generation credits per month.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-6 mb-6 border border-yellow-200/50"
          >
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Crown className="h-6 w-6 text-yellow-500" />
              <span className="font-bold text-xl text-gray-900">Creator Features Unlocked</span>
            </div>
            <ul className="text-gray-700 space-y-2">
              <li className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span>30 monthly generation credits</span>
              </li>
              <li className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span>AI video generation capabilities</span>
              </li>
              <li className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span>High-quality PNG downloads</span>
              </li>
              <li className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span>Personalized video creation</span>
              </li>
              <li className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-yellow-500" />
                <span>Priority support</span>
              </li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-blue-50 rounded-lg p-4 mb-6"
          >
            <p className="text-blue-800 font-medium">
              Monthly subscription: {product.currency} {product.price.toFixed(2)}
            </p>
            <p className="text-blue-600 text-sm mt-1">
              Your subscription will automatically renew each month
            </p>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.href = '/'}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center space-x-3"
          >
            <span>Start Creating Logos</span>
            <ArrowRight className="h-6 w-6" />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};