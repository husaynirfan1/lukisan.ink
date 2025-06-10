import { supabase } from './supabase';
import toast from 'react-hot-toast';

export interface EmailVerificationResult {
  success: boolean;
  message?: string;
  error?: string;
  alreadyVerified?: boolean;
}

/**
 * Request a new verification email for the current user using Supabase auth
 */
export const requestVerificationEmail = async (): Promise<EmailVerificationResult> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return { success: false, error: 'User not authenticated' };
    }

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-verification-email`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error('Error requesting verification email:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send verification email' 
    };
  }
};

/**
 * Check if the current user's email is verified
 */
export const checkEmailVerificationStatus = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    // Check both Supabase auth confirmation and our custom flag
    const isSupabaseConfirmed = user.email_confirmed_at !== null;
    
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('is_email_verified')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error checking verification status:', error);
      return isSupabaseConfirmed; // Fallback to Supabase confirmation
    }

    // If Supabase says confirmed but our flag is false, update our flag
    if (isSupabaseConfirmed && !userProfile?.is_email_verified) {
      await supabase
        .from('users')
        .update({ is_email_verified: true })
        .eq('id', user.id);
      
      return true;
    }

    return userProfile?.is_email_verified || false;

  } catch (error) {
    console.error('Error checking email verification status:', error);
    return false;
  }
};

/**
 * Resend verification email with user feedback
 */
export const resendVerificationEmail = async (): Promise<void> => {
  const loadingToast = toast.loading('Sending verification email...');
  
  try {
    const result = await requestVerificationEmail();
    
    toast.dismiss(loadingToast);
    
    if (result.success) {
      if (result.alreadyVerified) {
        toast.success('Your email is already verified!');
      } else {
        toast.success('Verification email sent! Please check your inbox.');
      }
    } else {
      toast.error(result.error || 'Failed to send verification email');
    }
  } catch (error) {
    toast.dismiss(loadingToast);
    toast.error('An unexpected error occurred');
  }
};