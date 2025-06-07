/*
  # Image Cleanup Policies for Free Users

  1. Database Functions
    - Function to delete expired images for free users
    - Function to clean up storage files

  2. Scheduled Jobs
    - Automatic cleanup every hour for expired free user images

  3. Storage Policies
    - Enhanced policies for image management
*/

-- Function to clean up expired images for free users
CREATE OR REPLACE FUNCTION cleanup_expired_free_images()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_image RECORD;
  storage_path TEXT;
BEGIN
  -- Find expired images for free users (older than 2 hours)
  FOR expired_image IN
    SELECT lg.id, lg.image_url, lg.user_id, u.tier
    FROM logo_generations lg
    JOIN users u ON lg.user_id = u.id
    WHERE u.tier = 'free'
    AND lg.created_at < NOW() - INTERVAL '2 hours'
    AND lg.image_url LIKE '%supabase.co/storage/v1/object/public/generated-images/%'
  LOOP
    -- Extract storage path from URL
    storage_path := SUBSTRING(expired_image.image_url FROM 'generated-images/(.+)$');
    
    IF storage_path IS NOT NULL THEN
      -- Delete from storage
      PERFORM storage.delete_object('generated-images', storage_path);
      
      -- Log the cleanup
      RAISE NOTICE 'Deleted expired image: % for user: %', storage_path, expired_image.user_id;
    END IF;
    
    -- Delete from database
    DELETE FROM logo_generations WHERE id = expired_image.id;
  END LOOP;
END;
$$;

-- Function to clean up images when user subscription ends
CREATE OR REPLACE FUNCTION cleanup_user_images_on_subscription_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_image RECORD;
  storage_path TEXT;
BEGIN
  -- Check if subscription status changed to inactive/canceled
  IF OLD.status IN ('active', 'trialing') AND NEW.status IN ('canceled', 'past_due', 'unpaid', 'incomplete_expired') THEN
    -- Get user ID from customer
    DECLARE
      user_id_val UUID;
    BEGIN
      SELECT sc.user_id INTO user_id_val
      FROM stripe_customers sc
      WHERE sc.customer_id = NEW.customer_id;
      
      IF user_id_val IS NOT NULL THEN
        -- Clean up user's stored images
        FOR user_image IN
          SELECT lg.id, lg.image_url
          FROM logo_generations lg
          WHERE lg.user_id = user_id_val
          AND lg.image_url LIKE '%supabase.co/storage/v1/object/public/generated-images/%'
        LOOP
          -- Extract storage path from URL
          storage_path := SUBSTRING(user_image.image_url FROM 'generated-images/(.+)$');
          
          IF storage_path IS NOT NULL THEN
            -- Delete from storage
            PERFORM storage.delete_object('generated-images', storage_path);
            
            -- Log the cleanup
            RAISE NOTICE 'Deleted image on subscription end: % for user: %', storage_path, user_id_val;
          END IF;
          
          -- Delete from database
          DELETE FROM logo_generations WHERE id = user_image.id;
        END LOOP;
        
        -- Reset user tier to free
        UPDATE users SET tier = 'free', credits_remaining = 0 WHERE id = user_id_val;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for subscription status changes
DROP TRIGGER IF EXISTS trigger_cleanup_on_subscription_end ON stripe_subscriptions;
CREATE TRIGGER trigger_cleanup_on_subscription_end
  AFTER UPDATE ON stripe_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_user_images_on_subscription_end();

-- Function to manually clean up a specific user's images
CREATE OR REPLACE FUNCTION cleanup_user_images(target_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_image RECORD;
  storage_path TEXT;
  deleted_count INTEGER := 0;
BEGIN
  -- Clean up user's stored images
  FOR user_image IN
    SELECT lg.id, lg.image_url
    FROM logo_generations lg
    WHERE lg.user_id = target_user_id
    AND lg.image_url LIKE '%supabase.co/storage/v1/object/public/generated-images/%'
  LOOP
    -- Extract storage path from URL
    storage_path := SUBSTRING(user_image.image_url FROM 'generated-images/(.+)$');
    
    IF storage_path IS NOT NULL THEN
      -- Delete from storage
      PERFORM storage.delete_object('generated-images', storage_path);
      deleted_count := deleted_count + 1;
    END IF;
    
    -- Delete from database
    DELETE FROM logo_generations WHERE id = user_image.id;
  END LOOP;
  
  RETURN deleted_count;
END;
$$;

-- Create a scheduled job to run cleanup every hour (requires pg_cron extension)
-- Note: This requires the pg_cron extension to be enabled in your Supabase project
-- You can enable it in the Supabase dashboard under Database > Extensions

-- SELECT cron.schedule(
--   'cleanup-expired-images',
--   '0 * * * *', -- Every hour
--   'SELECT cleanup_expired_free_images();'
-- );

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_free_images() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_user_images(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_user_images_on_subscription_end() TO service_role;

-- Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_logo_generations_cleanup 
ON logo_generations(user_id, created_at) 
WHERE image_url LIKE '%supabase.co/storage/v1/object/public/generated-images/%';

-- Add index for user tier queries
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);