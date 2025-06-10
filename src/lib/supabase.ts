import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Enhanced Supabase client with better error handling and retry logic
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: {
      'X-Client-Info': 'lukisan-app'
    }
  },
  // Add retry configuration for network resilience
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Network connectivity checker
export const checkSupabaseConnectivity = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    return response.ok;
  } catch (error) {
    console.error('Supabase connectivity check failed:', error);
    return false;
  }
};

// Enhanced error handler for Supabase operations
export const handleSupabaseError = (error: any, operation: string) => {
  console.error(`Supabase ${operation} error:`, error);
  
  if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
    return {
      isNetworkError: true,
      userMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
      shouldRetry: true
    };
  }
  
  if (error.message?.includes('CORS')) {
    return {
      isNetworkError: true,
      userMessage: 'Connection blocked. Please refresh the page and try again.',
      shouldRetry: true
    };
  }
  
  return {
    isNetworkError: false,
    userMessage: error.message || 'An unexpected error occurred.',
    shouldRetry: false
  };
};

// Retry wrapper for Supabase operations
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorInfo = handleSupabaseError(error, 'retry-operation');
      
      if (!errorInfo.shouldRetry || attempt === maxRetries) {
        throw error;
      }
      
      console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  throw lastError;
};

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  tier: 'free' | 'pro';
  credits_remaining: number;
  daily_generations: number;
  last_generation_date: string;
  created_at: string;
  pro_expires_at?: string;
  is_email_verified: boolean;
  email_verification_token?: string;
}

export interface LogoGeneration {
  id: string;
  user_id: string;
  prompt: string;
  category: string;
  image_url: string;
  created_at: string;
}