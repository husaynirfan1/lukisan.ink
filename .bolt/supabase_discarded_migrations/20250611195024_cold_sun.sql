/*
  # Fix video_url NOT NULL constraint

  1. Schema Changes
    - Modify video_url column to allow NULL values temporarily during processing
    - Add check constraint to ensure completed videos have video_url

  2. Data Migration
    - Update any existing records with empty video_url to NULL
*/

-- First, update any empty video_url values to NULL
UPDATE video_generations 
SET video_url = NULL 
WHERE video_url = '' OR video_url = 'processing';

-- Modify the column to allow NULL values
ALTER TABLE video_generations 
ALTER COLUMN video_url DROP NOT NULL;

-- Add a check constraint to ensure completed videos have video_url
ALTER TABLE video_generations 
ADD CONSTRAINT video_url_required_when_completed 
CHECK (
  (status != 'completed') OR 
  (status = 'completed' AND video_url IS NOT NULL AND video_url != '')
);

-- Add comment to document the constraint
COMMENT ON CONSTRAINT video_url_required_when_completed ON video_generations IS 
'Ensures that completed videos must have a valid video_url';