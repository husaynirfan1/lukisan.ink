/*
  # Add storage_path column to logo_generations table

  1. Changes
    - Add `storage_path` column to `logo_generations` table
    - Column will store the file path in Supabase Storage for easier file management
    - Set as nullable since existing records won't have this value
    - Add index for potential future queries on storage paths

  2. Notes
    - This column will help with file cleanup and management operations
    - Existing records will have NULL values for storage_path
    - New logo generations will populate this field
*/

-- Add storage_path column to logo_generations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logo_generations' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE logo_generations ADD COLUMN storage_path text;
  END IF;
END $$;

-- Add index for storage_path column for potential cleanup operations
CREATE INDEX IF NOT EXISTS idx_logo_generations_storage_path 
ON logo_generations(storage_path) 
WHERE storage_path IS NOT NULL;