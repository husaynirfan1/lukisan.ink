/*
  # Create Storage Bucket for Generated Videos

  1. Storage Setup
    - Create `generated-videos` bucket for storing video files
    - Enable public access for video viewing
    - Set up appropriate policies for authenticated users

  2. Security
    - Allow authenticated users to upload videos to their own folders
    - Allow public read access to all videos
    - Prevent unauthorized deletions
*/

-- Create the storage bucket for generated videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-videos',
  'generated-videos', 
  true,
  104857600, -- 100MB limit
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
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

-- Add storage_path column to video_generations table
ALTER TABLE video_generations 
ADD COLUMN IF NOT EXISTS storage_path text;

-- Add index for faster video cleanup queries
CREATE INDEX IF NOT EXISTS idx_video_generations_storage_path 
ON video_generations(storage_path) 
WHERE storage_path IS NOT NULL;

-- Function to clean up expired videos for free users
CREATE OR REPLACE FUNCTION cleanup_expired_free_videos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_video RECORD;
  storage_path TEXT;
BEGIN
  -- Find expired videos for free users (older than 2 hours)
  FOR expired_video IN
    SELECT vg.id, vg.video_url, vg.storage_path, vg.user_id, u.tier
    FROM video_generations vg
    JOIN users u ON vg.user_id = u.id
    WHERE u.tier = 'free'
    AND vg.created_at < NOW() - INTERVAL '2 hours'
    AND vg.storage_path IS NOT NULL
  LOOP
    -- Delete from storage
    PERFORM storage.delete_object('generated-videos', expired_video.storage_path);
    
    -- Log the cleanup
    RAISE NOTICE 'Deleted expired video: % for user: %', expired_video.storage_path, expired_video.user_id;
    
    -- Delete from database
    DELETE FROM video_generations WHERE id = expired_video.id;
  END LOOP;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_free_videos() TO service_role;