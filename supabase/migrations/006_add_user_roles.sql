-- =============================================
-- Add user roles for admin access control
-- Migration 006
-- =============================================

-- Add role column to users table (default to 'user')
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Add comment explaining role values
COMMENT ON COLUMN public.users.role IS 'User role: user (default) or admin';

-- Update existing users to have 'user' role if NULL
UPDATE public.users
SET role = 'user'
WHERE role IS NULL;

-- Optionally: If you have a specific admin user, uncomment and update:
-- UPDATE public.users
-- SET role = 'admin'
-- WHERE email = 'your-admin-email@example.com';
