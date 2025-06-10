import { loadStripe } from '@stripe/stripe-js';
import { supabase } from './supabase';

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
  throw new Error('Missing Stripe publishable key');
}

export const stripe = loadStripe(stripePublishableKey);

export interface CreateCheckoutSessionRequest {
  priceId: string;
  mode: 'payment' | 'subscription';
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Check if user's email is verified before allowing payment
 */
const checkEmailVerification = async (): Promise<{ verified: boolean; user: any }> => {
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('User not authenticated');
  }

  // Get user profile to check verification status
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('is_email_verified')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('Error checking user profile:', profileError);
    // If we can't check, assume not verified for safety
    return { verified: false, user };
  }

  return { 
    verified: userProfile?.is_email_verified || false, 
    user 
  };
};

export const createCheckoutSession = async (request: CreateCheckoutSessionRequest) => {
  // CRITICAL: Check email verification before any payment processing
  const { verified, user } = await checkEmailVerification();
  
  if (!verified) {
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('User not authenticated');
  }

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`;
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      price_id: request.priceId,
      mode: request.mode,
      success_url: request.successUrl || `${window.location.origin}/success`,
      cancel_url: request.cancelUrl || `${window.location.origin}/cancel`,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create checkout session');
  }

  return response.json();
};

export const getUserSubscription = async () => {
  const { data, error } = await supabase
    .from('stripe_user_subscriptions')
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  return data;
};

export const getUserOrders = async () => {
  const { data, error } = await supabase
    .from('stripe_user_orders')
    .select('*')
    .order('order_date', { ascending: false });

  if (error) {
    console.error('Error fetching orders:', error);
    return [];
  }

  return data || [];
};