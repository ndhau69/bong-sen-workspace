-- ============================================================================
-- BÔNG SEN ACCOUNTING - MIGRATION 0009: SCREEN PERMISSIONS (SHOW / HIDE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.role_screen_permissions (
  role public.app_role NOT NULL,
  screen_key text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, screen_key)
);

CREATE TABLE IF NOT EXISTS public.user_screen_permissions (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  screen_key text NOT NULL,
  is_visible boolean NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, screen_key)
);

ALTER TABLE public.role_screen_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_screen_permissions ENABLE ROW LEVEL SECURITY;

-- Đọc quyền màn hình của vai trò hiện tại (hoặc Admin đọc toàn bộ)
CREATE POLICY "Read role screen permissions"
  ON public.role_screen_permissions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR role = public.current_user_role()
  );

CREATE POLICY "Admins manage role screen permissions"
  ON public.role_screen_permissions FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- User chỉ đọc override của chính mình, Admin đọc và sửa toàn bộ
CREATE POLICY "Read user screen permissions"
  ON public.user_screen_permissions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR user_id = auth.uid()
  );

CREATE POLICY "Admins manage user screen permissions"
  ON public.user_screen_permissions FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- Seed mặc định Show / Hide cho 11 màn hình × 4 vai trò
INSERT INTO public.role_screen_permissions (role, screen_key, is_visible) VALUES
  -- ADMIN: toàn quyền
  ('admin', 'dashboard', true),
  ('admin', 'customers', true),
  ('admin', 'cases', true),
  ('admin', 'tasks', true),
  ('admin', 'kanban', true),
  ('admin', 'employees', true),
  ('admin', 'finance', true),
  ('admin', 'documents', true),
  ('admin', 'reports', true),
  ('admin', 'settings', true),
  ('admin', 'user_access', true),

  -- MANAGER
  ('manager', 'dashboard', true),
  ('manager', 'customers', true),
  ('manager', 'cases', true),
  ('manager', 'tasks', true),
  ('manager', 'kanban', true),
  ('manager', 'employees', true),
  ('manager', 'finance', true),
  ('manager', 'documents', true),
  ('manager', 'reports', true),
  ('manager', 'settings', true),
  ('manager', 'user_access', false),

  -- STAFF
  ('staff', 'dashboard', true),
  ('staff', 'customers', true),
  ('staff', 'cases', true),
  ('staff', 'tasks', true),
  ('staff', 'kanban', true),
  ('staff', 'employees', false),
  ('staff', 'finance', false),
  ('staff', 'documents', true),
  ('staff', 'reports', true),
  ('staff', 'settings', false),
  ('staff', 'user_access', false),

  -- ACCOUNTANT
  ('accountant', 'dashboard', true),
  ('accountant', 'customers', true),
  ('accountant', 'cases', true),
  ('accountant', 'tasks', false),
  ('accountant', 'kanban', false),
  ('accountant', 'employees', false),
  ('accountant', 'finance', true),
  ('accountant', 'documents', true),
  ('accountant', 'reports', true),
  ('accountant', 'settings', false),
  ('accountant', 'user_access', false)
ON CONFLICT (role, screen_key) DO NOTHING;
