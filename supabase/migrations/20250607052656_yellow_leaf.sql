/*
  # Create users and video generations tables

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `name` (text)
      - `avatar_url` (text, optional)
      - `tier` (text, default 'free')
      - `credits_remaining` (integer, default 0)
      - `daily_generations` (integer, default 0)
      - `last_generation_date` (timestamptz)
      - `created_at` (timestamptz)
      - `pro_expires_at` (timestamptz, optional)
    
    - `logo_generations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `prompt` (text)
      - `category` (text)
      - `image_url` (text)
      - `created_at` (timestamptz)
    
    - `video_generations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `video_type` (text, check constraint)
      - `message` (text)
      - `recipient_name` (text, optional)
      - `company_name` (text, optional)
      - `video_id` (text)
      - `video_url` (text)
      - `logo_url` (text, optional)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add indexes for performance
*/

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  tier text DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  credits_remaining integer DEFAULT 0,
  daily_generations integer DEFAULT 0,
  last_generation_date timestamptz,
  created_at timestamptz DEFAULT now(),
  pro_expires_at timestamptz
);

-- Create logo_generations table if it doesn't exist
CREATE TABLE IF NOT EXISTS logo_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  category text NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create video_generations table
CREATE TABLE IF NOT EXISTS video_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_type text NOT NULL CHECK (video_type IN ('welcome', 'marketing')),
  message text NOT NULL,
  recipient_name text,
  company_name text,
  video_id text NOT NULL,
  video_url text NOT NULL,
  logo_url text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE logo_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Logo generations policies
CREATE POLICY "Users can read own logo generations"
  ON logo_generations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logo generations"
  ON logo_generations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Video generations policies
CREATE POLICY "Users can read own video generations"
  ON video_generations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own video generations"
  ON video_generations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS logo_generations_user_id_idx ON logo_generations(user_id);
CREATE INDEX IF NOT EXISTS logo_generations_created_at_idx ON logo_generations(created_at DESC);
CREATE INDEX IF NOT EXISTS video_generations_user_id_idx ON video_generations(user_id);
CREATE INDEX IF NOT EXISTS video_generations_created_at_idx ON video_generations(created_at DESC);