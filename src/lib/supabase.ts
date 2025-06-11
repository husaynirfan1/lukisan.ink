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
    },
    fetch: (url, options = {}) => {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
      });
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('Supabase connectivity check failed:', error);
    return false;
  }
};

// Enhanced error handler for Supabase operations
export const handleSupabaseError = (error: any, operation: string) => {
  console.error(`Supabase ${operation} error:`, error);
  
  // Check for network-related errors
  if (error.message?.includes('Failed to fetch') || 
      error.message?.includes('NetworkError') ||
      error.message?.includes('fetch') ||
      error.message?.includes('aborted') ||
      error.name === 'TypeError' ||
      error.name === 'AbortError' ||
      !navigator.onLine) {
    return {
      isNetworkError: true,
      userMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
      shouldRetry: true,
      suggestion: 'Check that your Supabase project URL is correct and that https://localhost:5173 is added to your allowed origins.'
    };
  }
  
  // Check for CORS-related errors
  if (error.message?.includes('CORS') || 
      error.message?.includes('Access-Control-Allow-Origin') ||
      (error.status === 0 && error.statusText === '')) {
    return {
      isNetworkError: true,
      userMessage: 'Connection blocked by browser security. Please check your Supabase configuration.',
      shouldRetry: true,
      suggestion: 'Add https://localhost:5173 to your Supabase project\'s allowed origins in Authentication settings.'
    };
  }

  // Check for authentication errors
  if (error.message?.includes('Invalid JWT') || 
      error.message?.includes('JWT expired') ||
      error.status === 401) {
    return {
      isNetworkError: false,
      userMessage: 'Authentication session expired. Please sign in again.',
      shouldRetry: false,
      suggestion: 'Try refreshing the page or signing out and back in.'
    };
  }

  // Check for database constraint errors
  if (error.code === '23502' || error.message?.includes('not-null constraint')) {
    return {
      isNetworkError: false,
      userMessage: 'Invalid data provided. Please check your input and try again.',
      shouldRetry: false,
      suggestion: 'Ensure all required fields are filled out correctly.'
    };
  }
  
  return {
    isNetworkError: false,
    userMessage: error.message || 'An unexpected error occurred.',
    shouldRetry: false,
    suggestion: 'If the problem persists, please try refreshing the page.'
  };
};

// Retry wrapper for Supabase operations with exponential backoff
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
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
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      console.log(`Retry attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms delay`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

// Enhanced connection test with detailed diagnostics
export const testSupabaseConnection = async (): Promise<{
  success: boolean;
  error?: string;
  diagnostics: {
    urlReachable: boolean;
    authEndpoint: boolean;
    restEndpoint: boolean;
    corsIssue: boolean;
  };
}> => {
  const diagnostics = {
    urlReachable: false,
    authEndpoint: false,
    restEndpoint: false,
    corsIssue: false
  };

  try {
    // Test basic URL reachability
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      diagnostics.urlReachable = true;
      diagnostics.restEndpoint = response.ok;
    } catch (error: any) {
      if (error.message?.includes('CORS') || error.name === 'TypeError') {
        diagnostics.corsIssue = true;
      }
    }

    // Test auth endpoint
    try {
      const { data, error } = await supabase.auth.getSession();
      diagnostics.authEndpoint = !error;
    } catch (error) {
      // Auth endpoint test failed
    }

    const success = diagnostics.urlReachable && diagnostics.restEndpoint && diagnostics.authEndpoint;
    
    return {
      success,
      error: success ? undefined : 'Connection test failed',
      diagnostics
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Connection test failed',
      diagnostics
    };
  }
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