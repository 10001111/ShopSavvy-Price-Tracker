-- =============================================
-- Migration 005: search_history table
-- Tracks what logged-in users search for so that
-- Highlighted Deals and Popular Products can be
-- personalised to each user's interests.
-- =============================================

CREATE TABLE IF NOT EXISTS public.search_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  source TEXT,                          -- 'amazon' | 'mercadolibre' | 'all'
  result_count INTEGER DEFAULT 0,      -- how many results came back
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_id
  ON public.search_history(user_id);

CREATE INDEX IF NOT EXISTS idx_search_history_created_at
  ON public.search_history(created_at);

-- RLS: service role full access (same pattern as other tables)
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then recreate
DROP POLICY IF EXISTS "Service role has full access to search_history" ON public.search_history;

CREATE POLICY "Service role has full access to search_history"
  ON public.search_history
  FOR ALL USING (true) WITH CHECK (true);
