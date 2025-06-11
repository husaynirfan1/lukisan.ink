/*
  # Video Library Enhancement

  1. Schema Updates
    - Add missing columns to video_generations table for better status tracking
    - Add storage bucket for generated videos
    - Update RLS policies

  2. New Columns
    - `status` (enum: pending, processing, completed, failed)
    - `progress` (integer: 0-100)
    - `error_message` (text)
    - `storage_path` (text)
    - `task_id` (text)
    - `updated_at` (timestamptz)

  3. Storage Setup
    - Create generated-videos bucket
    - Set up appropriate policies
*/

-- Create status enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE video_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to video_generations table
ALTER TABLE video_generations 
ADD COLUMN IF NOT EXISTS status video_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS storage_path text,
ADD COLUMN IF NOT EXISTS task_id text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_video_generations_status ON video_generations(status);
CREATE INDEX IF NOT EXISTS idx_video_generations_task_id ON video_generations(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_generations_updated_at ON video_generations(updated_at DESC);

-- Create the storage bucket for generated videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-videos',
  'generated-videos', 
  true,
  104857600, -- 100MB limit
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload videos to their own folder
CREATE POLICY "Users can upload videos to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-videos' 
  AND (storage.foldername(name))[1] = 'videos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to update their own videos
CREATE POLICY "Users can update own videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'generated-videos'
  AND (storage.foldername(name))[1] = 'videos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to delete their own videos
CREATE POLICY "Users can delete own videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-videos'
  AND (storage.foldername(name))[1] = 'videos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow public read access to all videos in the bucket
CREATE POLICY "Public read access for generated videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'generated-videos');

-- Add policy for users to delete their own video generations
CREATE POLICY "Users can delete own video generations"
  ON video_generations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_video_generations_updated_at ON video_generations;
CREATE TRIGGER update_video_generations_updated_at
    BEFORE UPDATE ON video_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing records to have default status
UPDATE video_generations 
SET status = 'pending', updated_at = now()
WHERE status IS NULL;