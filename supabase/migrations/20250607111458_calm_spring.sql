/*
  # Create Storage Bucket for Generated Images

  1. Storage Setup
    - Create `generated-images` bucket for storing logo images
    - Enable public access for image viewing
    - Set up appropriate policies for authenticated users

  2. Security
    - Allow authenticated users to upload images to their own folders
    - Allow public read access to all images
    - Prevent unauthorized deletions
*/

-- Create the storage bucket for generated images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-images',
  'generated-images', 
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload images to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'generated-images' 
  AND (storage.foldername(name))[1] = 'logos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update own images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'generated-images'
  AND (storage.foldername(name))[1] = 'logos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete own images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'generated-images'
  AND (storage.foldername(name))[1] = 'logos'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow public read access to all images in the bucket
CREATE POLICY "Public read access for generated images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'generated-images');