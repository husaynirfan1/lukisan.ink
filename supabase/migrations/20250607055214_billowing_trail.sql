/*
  # Fix users table RLS policy for profile creation

  1. Security
    - Add INSERT policy for users table to allow authenticated users to create their own profile
    - This fixes the RLS policy violation when creating new user profiles during signup

  The policy ensures that users can only insert rows where the id matches their authenticated user ID.
*/

-- Add INSERT policy for users table
CREATE POLICY "Users can insert own profile"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);