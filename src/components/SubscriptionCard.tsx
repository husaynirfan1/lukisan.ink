import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Crown, Loader2, Check, Sparkles } from 'lucide-react';
import { stripeProducts } from '../stripe-config';
import { createCheckoutSession, getUserSubscription } from '../lib/stripe';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export const SubscriptionCard: React.FC = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSubscription();
    }
  }, [user]);

  const fetchSubscription = async () => {
    try {
      const sub = await getUserSubscription();
      setSubscription(sub);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoadingSubscription(false);
    }
  };

  const handleSubscribe = async () => {
    if (!user) {
      toast.error('Please sign in to subscribe');
      return;
    }

    const product = stripeProducts[0]; // Pro product
    setIsLoading(true);

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
      setIsLoading(false);
    }
  };

  if (!user) return null;

  const product = stripeProducts[0]; // Pro product
  const isActive = subscription?.subscription_status === 'active';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-2xl p-6 border border-yellow-200/50 shadow-lg"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl shadow-lg">
            <Crown className="h-7 w-7 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900">{product.name}</h3>
            <p className="text-gray-600 text-lg">{product.description}</p>
          </div>
        </div>
        
        {loadingSubscription ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        ) : isActive ? (
          <div className="flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-800 rounded-full shadow-sm">
            <Check className="h-5 w-5" />
            <span className="font-medium">Active</span>
          </div>
        ) : null}
      </div>

      <div className="mb-6">
        <div className="text-4xl font-bold text-gray-900 mb-3">
          {product.currency} {product.price.toFixed(2)}
          <span className="text-xl font-normal text-gray-600">/month</span>
        </div>
        
        <ul className="space-y-3 text-gray-700">
          <li className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-3 w-3 text-green-600" />
            </div>
            <span className="text-lg">100 AI logo generation credits per month</span>
          </li>
          <li className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-3 w-3 text-green-600" />
            </div>
            <span className="text-lg">AI video generation capabilities</span>
          </li>
          <li className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-3 w-3 text-green-600" />
            </div>
            <span className="text-lg">High-quality PNG & SVG downloads</span>
          </li>
          <li className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-3 w-3 text-green-600" />
            </div>
            <span className="text-lg">Personalized video creation</span>
          </li>
          <li className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-3 w-3 text-green-600" />
            </div>
            <span className="text-lg">Priority support</span>
          </li>
          <li className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="h-3 w-3 text-green-600" />
            </div>
            <span className="text-lg">Unlock all premium options</span>
          </li>
        </ul>
      </div>

      {!isActive && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSubscribe}
          disabled={isLoading}
          className="w-full py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-bold text-lg hover:from-yellow-500 hover:to-orange-600 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-6 w-6" />
              <span>Upgrade to Pro</span>
            </>
          )}
        </motion.button>
      )}

      {isActive && subscription && (
        <div className="text-center text-gray-600 bg-white/50 rounded-lg p-4">
          <p className="font-medium text-lg mb-1">
            Your Pro subscription is active
          </p>
          <p className="text-sm">
            Renews on {new Date(subscription.current_period_end * 1000).toLocaleDateString('en-MY', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
          {subscription.cancel_at_period_end && (
            <p className="text-orange-600 mt-2 font-medium">
              Subscription will cancel at the end of the current period
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
};