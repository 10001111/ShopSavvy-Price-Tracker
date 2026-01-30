-- =============================================
-- OfertaRadar - Supabase Tables
-- Run this in Supabase SQL Editor
-- =============================================

-- Users table (stores app users with hashed passwords)
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  auth_provider TEXT DEFAULT 'local'
);

-- Login history table (tracks all login attempts)
CREATE TABLE IF NOT EXISTS public.login_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  user_agent TEXT,
  auth_method TEXT DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User sessions table (tracks active sessions)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

-- Tracked products table (for price alerts)
CREATE TABLE IF NOT EXISTS public.tracked_products (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_url TEXT,
  source TEXT DEFAULT 'mercadolibre',
  target_price DECIMAL(10,2),
  current_price DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked TIMESTAMPTZ
);

-- Price history table (stores price changes)
CREATE TABLE IF NOT EXISTS public.price_history (
  id BIGSERIAL PRIMARY KEY,
  tracked_product_id BIGINT NOT NULL REFERENCES public.tracked_products(id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON public.login_history(created_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_products_user_id ON public.tracked_products(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracked_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow service role full access (for server-side operations)
CREATE POLICY "Service role has full access to users" ON public.users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to login_history" ON public.login_history
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to user_sessions" ON public.user_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to tracked_products" ON public.tracked_products
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to price_history" ON public.price_history
  FOR ALL USING (true) WITH CHECK (true);

-- Insert demo accounts (passwords are bcrypt hashed)
-- demo1234 = $2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqZLlNGqH5.5qxJM5r9W5x5x5x5x5
-- test1234 = $2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqZLlNGqH5.5qxJM5r9W5x5x5x5x5
-- admin1234 = $2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqZLlNGqH5.5qxJM5r9W5x5x5x5x5

INSERT INTO public.users (email, password_hash, verified, auth_provider)
VALUES
  ('demo@ofertaradar.com', '$2a$10$gDGM8tlLhj2xtc3uceRpJOWTolvtEVMNCD.9234RJ9ehkcoz6qvda', TRUE, 'local'),
  ('test@example.com', '$2a$10$oUevhSl0Cr8TMVcV5nU3MuazhR1DjW2EV255uDT35yZRtjnVro69u', TRUE, 'local'),
  ('admin@ofertaradar.com', '$2a$10$SMQkSKPv.kRFi4LljXdE9e/gf7JuhMm8UsVuXnCtKDt.z4j7Xah.u', TRUE, 'local')
ON CONFLICT (email) DO NOTHING;

-- Verify tables were created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
