/*
  # Add updated_at column to video_generations table

  1. Schema Changes
    - Add updated_at column with timestamptz type
    - Set default value to now() for existing records
    - Create trigger to automatically update the column on row modifications

  2. Security
    - No changes to RLS policies needed
*/

-- Add the updated_at column
ALTER TABLE video_generations 
ADD COLUMN updated_at timestamptz DEFAULT now();

-- Create a function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update updated_at on row modifications
CREATE TRIGGER update_video_generations_updated_at
    BEFORE UPDATE ON video_generations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing records to have the current timestamp
UPDATE video_generations 
SET updated_at = now() 
WHERE updated_at IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN video_generations.updated_at IS 
'Timestamp of when the record was last updated, automatically maintained by trigger';