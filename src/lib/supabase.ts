import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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