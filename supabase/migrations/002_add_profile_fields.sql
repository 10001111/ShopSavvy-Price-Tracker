-- =============================================
-- OfertaRadar - Add Profile Fields
-- Migration: 002_add_profile_fields
-- Run this in Supabase SQL Editor after 001_create_tables.sql
-- =============================================

-- Add username column for profile customization
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username TEXT;

-- Add profile_picture_url column for avatar storage
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Create storage bucket for profile pictures (run in Supabase Dashboard > Storage)
-- Note: You need to create a bucket named 'avatars' in Supabase Storage Dashboard
-- and set the following policy:
--
-- Policy for public avatar access:
-- CREATE POLICY "Avatar images are publicly accessible"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'avatars');
--
-- Policy for authenticated users to upload their own avatar:
-- CREATE POLICY "Users can upload their own avatar"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
--
-- Policy for users to update their own avatar:
-- CREATE POLICY "Users can update their own avatar"
--   ON storage.objects FOR UPDATE
--   USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Verify columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users' AND table_schema = 'public';
