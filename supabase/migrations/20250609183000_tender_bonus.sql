/*
  # Add aspect_ratio column to logo_generations table

  1. Schema Changes
    - Add `aspect_ratio` column to `logo_generations` table
    - Set default value to '1:1' for existing records
    - Make column nullable to handle legacy data

  2. Data Migration
    - Update existing records to have default aspect ratio
    - Ensure backward compatibility
*/

-- Add the aspect_ratio column to logo_generations table
ALTER TABLE logo_generations 
ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT '1:1';

-- Update any existing records that might have NULL values
UPDATE logo_generations 
SET aspect_ratio = '1:1' 
WHERE aspect_ratio IS NULL;

-- Add a comment to document the column
COMMENT ON COLUMN logo_generations.aspect_ratio IS 'Aspect ratio of the generated logo (e.g., 1:1, 16:9, 9:16)';