/*
  # Create Storage Bucket for Video Input Images

  1. Storage Setup
    - Create `video-inputs` bucket for storing images used in image-to-video generation
    - Enable public access for image processing
    - Set up appropriate policies for authenticated users

  2. Security
    - Allow authenticated users to upload images to their own folders
    - Allow public read access to all images for processing
    - Prevent unauthorized deletions
*/

-- Create the storage bucket for video input images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'video-inputs',
  'video-inputs', 
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload video input images to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'video-inputs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update own video input images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'video-inputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete own video input images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'video-inputs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all images in the bucket for processing
CREATE POLICY "Public read access for video input images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'video-inputs');