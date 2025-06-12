-- Create the storage bucket for generated videos if it doesn't exist
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

-- Add storage_path column to video_generations table if it doesn't exist
ALTER TABLE video_generations 
ADD COLUMN IF NOT EXISTS storage_path text;

-- Add index for faster video cleanup queries
CREATE INDEX IF NOT EXISTS idx_video_generations_storage_path 
ON video_generations(storage_path) 
WHERE storage_path IS NOT NULL;