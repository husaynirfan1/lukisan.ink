/*
  # Create video generations table

  1. New Tables
    - `video_generations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `video_type` (text, 'welcome' or 'marketing')
      - `message` (text, user's custom message)
      - `recipient_name` (text, optional)
      - `company_name` (text, optional)
      - `video_id` (text, Tavus video ID)
      - `video_url` (text, generated video URL)
      - `logo_url` (text, optional logo URL)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `video_generations` table
    - Add policy for users to read their own video generations
    - Add policy for users to insert their own video generations
*/

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

ALTER TABLE video_generations ENABLE ROW LEVEL SECURITY;

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

-- Create index for better performance
CREATE INDEX IF NOT EXISTS video_generations_user_id_idx ON video_generations(user_id);
CREATE INDEX IF NOT EXISTS video_generations_created_at_idx ON video_generations(created_at DESC);