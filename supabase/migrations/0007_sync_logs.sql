-- ============================================================================
-- BÔNG SEN WORKSPACE - MIGRATION 0007: GOOGLE SHEETS SYNC LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL DEFAULT 'google_sheets',
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  customers_count int NOT NULL DEFAULT 0,
  cases_count int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and managers read sync logs"
  ON public.integration_sync_logs FOR SELECT TO authenticated
  USING (public.can_view_finance());

CREATE POLICY "Finance and managers insert sync logs"
  ON public.integration_sync_logs FOR INSERT TO authenticated
  WITH CHECK (public.can_view_finance());
