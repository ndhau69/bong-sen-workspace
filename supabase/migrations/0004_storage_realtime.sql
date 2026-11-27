-- ============================================================================
-- BÔNG SEN WORKSPACE - MIGRATION 0004: STORAGE BUCKET & REALTIME
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-documents',
  'case-documents',
  false,
  26214400, -- 25MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies (yêu cầu path dạng: {customer_id}/{case_id}/{filename})
CREATE POLICY "Authenticated users read permitted case documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND (
      public.is_admin_or_manager()
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_path = storage.objects.name
      )
    )
  );

CREATE POLICY "Authenticated users upload case documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND public.current_user_role() IS NOT NULL
  );

CREATE POLICY "Admins and managers delete storage documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND public.is_admin_or_manager()
  );

-- Enable Realtime cho bảng thông báo và bảng hồ sơ/Kanban
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_cases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_steps;
