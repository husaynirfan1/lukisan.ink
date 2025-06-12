/*
  # Add status tracking to video_generations table

  1. Schema Changes
    - Add `status` column to track video processing state
    - Add `progress` column to track processing progress
    - Add `error_message` column to store error details
    - Add indexes for better query performance

  2. Data Migration
    - Set default status for existing records
    - Ensure backward compatibility
*/

-- Add status tracking columns to video_generations table
ALTER TABLE video_generations 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'running', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
ADD COLUMN IF NOT EXISTS error_message text DEFAULT null;

-- Update any existing records that might have NULL status
UPDATE video_generations 
SET status = 'pending' 
WHERE status IS NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_video_generations_status 
ON video_generations(status);

CREATE INDEX IF NOT EXISTS idx_video_generations_user_status 
ON video_generations(user_id, status);

-- Add comments to document the columns
COMMENT ON COLUMN video_generations.status IS 'Current processing status of the video generation';
COMMENT ON COLUMN video_generations.progress IS 'Processing progress percentage (0-100)';
COMMENT ON COLUMN video_generations.error_message IS 'Error message if generation failed';