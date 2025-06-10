/*
  # Fix Email Verification System

  1. Database Updates
    - Ensure email verification columns exist
    - Set proper defaults for new users
    - Add function to sync with Supabase auth

  2. Security
    - Maintain RLS policies
    - Ensure proper indexing
*/

-- Ensure email verification columns exist with proper defaults
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_email_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verification_token text DEFAULT null;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_users_verification_token 
ON users(email_verification_token) 
WHERE email_verification_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verified 
ON users(is_email_verified);

-- Function to sync email verification status with Supabase auth
CREATE OR REPLACE FUNCTION sync_email_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When a user record is inserted or updated, sync with auth.users
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Check if the user exists in auth.users and get their email_confirmed_at
    DECLARE
      auth_user_confirmed_at timestamptz;
    BEGIN
      SELECT email_confirmed_at INTO auth_user_confirmed_at
      FROM auth.users
      WHERE id = NEW.id;
      
      -- Update is_email_verified based on auth.users.email_confirmed_at
      IF auth_user_confirmed_at IS NOT NULL THEN
        NEW.is_email_verified := true;
      ELSE
        NEW.is_email_verified := false;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- If auth user doesn't exist or error occurs, default to false
        NEW.is_email_verified := false;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically sync email verification status
DROP TRIGGER IF EXISTS trigger_sync_email_verification ON users;
CREATE TRIGGER trigger_sync_email_verification
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_email_verification_status();

-- Function to manually sync all users' email verification status
CREATE OR REPLACE FUNCTION sync_all_email_verification_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT u.id, au.email_confirmed_at
    FROM users u
    LEFT JOIN auth.users au ON u.id = au.id
  LOOP
    UPDATE users 
    SET is_email_verified = (user_record.email_confirmed_at IS NOT NULL)
    WHERE id = user_record.id;
  END LOOP;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION sync_email_verification_status() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sync_all_email_verification_status() TO service_role;

-- Sync existing users' email verification status
SELECT sync_all_email_verification_status();

-- IMPORTANT: For new signups, ensure email confirmation is required
-- This should be configured in Supabase Dashboard:
-- Authentication -> Settings -> Email -> "Confirm email" should be enabled