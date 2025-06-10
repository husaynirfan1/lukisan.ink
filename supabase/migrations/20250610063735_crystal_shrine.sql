-- Add email verification columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_email_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_verification_token text DEFAULT null;

-- Add index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_verification_token 
ON users(email_verification_token) 
WHERE email_verification_token IS NOT NULL;

-- Add index for verification status queries
CREATE INDEX IF NOT EXISTS idx_users_email_verified 
ON users(is_email_verified);

-- Function to generate verification token
CREATE OR REPLACE FUNCTION generate_verification_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$;

-- Function to request email verification
CREATE OR REPLACE FUNCTION request_email_verification(user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record users%ROWTYPE;
  new_token text;
BEGIN
  -- Get user record
  SELECT * INTO user_record FROM users WHERE id = user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Check if already verified
  IF user_record.is_email_verified THEN
    RETURN json_build_object('success', true, 'message', 'Email already verified');
  END IF;
  
  -- Generate new token
  new_token := generate_verification_token();
  
  -- Update user with new token
  UPDATE users 
  SET email_verification_token = new_token 
  WHERE id = user_id;
  
  RETURN json_build_object(
    'success', true, 
    'token', new_token,
    'email', user_record.email,
    'name', user_record.name
  );
END;
$$;

-- Function to verify email token
CREATE OR REPLACE FUNCTION verify_email_token(token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record users%ROWTYPE;
BEGIN
  -- Find user with matching token
  SELECT * INTO user_record 
  FROM users 
  WHERE email_verification_token = token;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;
  
  -- Update user as verified and clear token
  UPDATE users 
  SET 
    is_email_verified = true,
    email_verification_token = null
  WHERE id = user_record.id;
  
  RETURN json_build_object(
    'success', true,
    'user_id', user_record.id,
    'email', user_record.email
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_verification_token() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION request_email_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION verify_email_token(text) TO authenticated, service_role, anon;

-- IMPORTANT: Do NOT auto-verify existing users - they should verify their email
-- Comment out the line below if you want to require verification for all users
-- UPDATE users SET is_email_verified = true WHERE is_email_verified = false;