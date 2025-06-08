/*
  # Add storage_path column to logo_generations table

  1. Changes
    - Add `storage_path` column to `logo_generations` table
    - This column will store the Supabase Storage file path for each generated logo
    - Allows for easier file management and cleanup operations

  2. Notes
    - Column is nullable to maintain compatibility with existing records
    - Existing records will have NULL storage_path values
*/

-- Add storage_path column to logo_generations table
ALTER TABLE public.logo_generations 
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Add comment to document the column purpose
COMMENT ON COLUMN public.logo_generations.storage_path IS 'File path in Supabase Storage for the generated logo image';