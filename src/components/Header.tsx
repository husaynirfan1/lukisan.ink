import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, User, LogOut, Crown, AlertCircle, Home } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { AuthModal } from './auth/AuthModal';
import { stripeProducts } from '../stripe-config';

export const Header: React.FC = () => {
  const { user, subscription, signOut, getUserTier, loading, error, authStep } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const userTier = getUserTier();
  const isProUser = userTier === 'pro';
  const product = stripeProducts[0]; // Pro product

  const handleLogoClick = () => {
    if (user) {
      // Redirect to dashboard for authenticated users
      window.location.href = '/dashboard';
    } else {
      // Redirect to home for unauthenticated users
      window.location.href = '/';
    }
  };

  const handleSignInSuccess = () => {
    setShowAuthModal(false);
    // Redirect to dashboard after successful sign in
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 100);
  };

  return (
    <>
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/80 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <motion.button 
              onClick={handleLogoClick}
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
              whileHover={{ scale: 1.05 }}
            >
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Lukisan
              </span>
            </motion.button>

            {/* Navigation for authenticated users */}
            {user && (
              // <div className="hidden md:flex items-center space-x-6">
              //   <button
              //     onClick={() => window.location.href = '/dashboard'}
              //     className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
              //       window.location.pathname.startsWith('/dashboard')
              //         ? 'bg-indigo-100 text-indigo-700'
              //         : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              //     }`}
              //   >
              //     <Sparkles className="h-4 w-4" />
              //     <span>Dashboard</span>
              //   </button>
              // </div>
            )

            <div className="flex items-center space-x-4">
              {/* Loading State */}
              {loading && (
                <div className="flex items-center space-x-2 text-gray-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                  <span className="text-sm">Loading...</span>
                  {process.env.NODE_ENV === 'development' && (
                    <span className="text-xs text-gray-400">({authStep})</span>
                  )}
                </div>
              )}

              {/* Error State */}
              {error && !loading && (
                <div className="flex items-center space-x-2 text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">Auth Error</span>
                </div>
              )}

              {/* Authenticated User */}
              {user && !loading && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-full">
                    {isProUser && (
                      <Crown className="h-4 w-4 text-yellow-500" />
                    )}
                    <span className="text-sm font-medium text-gray-700">
                      {isProUser ? `${user.credits_remaining} credits` : `Free tier`}
                    </span>
                  </div>
                  
                  {subscription?.subscription_status === 'active' && (
                    <div className="px-3 py-1 bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800 rounded-full border border-yellow-200">
                      <span className="text-sm font-medium">{product.name}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-2">
                    <img
                      src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.name}&background=6366F1&color=fff`}
                      alt={user.name}
                      className="h-8 w-8 rounded-full"
                    />
                    <span className="hidden sm:block text-sm font-medium text-gray-700">
                      {user.name}
                    </span>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={signOut}
                    className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                  </motion.button>
                </div>
              )}

              {/* Unauthenticated User */}
              {!user && !loading && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <User className="h-4 w-4" />
                  <span>Sign In</span>
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleSignInSuccess}
      />
    </>
  );
};