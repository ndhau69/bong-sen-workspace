-- ============================================================================
-- BÔNG SEN WORKSPACE - MIGRATION 0003: ROW LEVEL SECURITY (RBAC)
-- ============================================================================

-- Helper functions (SECURITY DEFINER để tránh đệ quy RLS trên bảng profiles)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'manager'), false);
$$;

CREATE OR REPLACE FUNCTION public.can_view_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'manager', 'accountant'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_to_case(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_cases sc
    WHERE sc.id = p_case_id AND sc.assigned_staff_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.case_steps cs
    WHERE cs.case_id = p_case_id AND cs.assignee_id = auth.uid()
  );
$$;

-- Enable RLS on all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. DEPARTMENTS & PROFILES
CREATE POLICY "Authenticated users can read departments"
  ON public.departments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage departments"
  ON public.departments FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Active users read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.current_user_role() IS NOT NULL);

CREATE POLICY "Users update own basic profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- 2. SERVICE CATALOG & WORKFLOW TEMPLATES
CREATE POLICY "Authenticated users read service categories"
  ON public.service_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage service categories"
  ON public.service_categories FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Authenticated users read services"
  ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage services"
  ON public.services FOR ALL TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "Authenticated users read workflow templates"
  ON public.workflow_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers manage workflow templates"
  ON public.workflow_templates FOR ALL TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

CREATE POLICY "Authenticated users read workflow template steps"
  ON public.workflow_template_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers manage workflow template steps"
  ON public.workflow_template_steps FOR ALL TO authenticated
  USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- 3. CUSTOMERS (CRM)
CREATE POLICY "Read customers by role"
  ON public.customers FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.is_admin_or_manager()
      OR public.current_user_role() = 'accountant'
      OR assigned_staff_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.service_cases sc
        WHERE sc.customer_id = customers.id AND public.is_assigned_to_case(sc.id)
      )
    )
  );

CREATE POLICY "Insert customers by role"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'staff'));

CREATE POLICY "Update customers by role"
  ON public.customers FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_manager()
    OR assigned_staff_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin_or_manager()
    OR assigned_staff_id = auth.uid()
  );

CREATE POLICY "Delete customers admin only"
  ON public.customers FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- 4. SERVICE CASES
CREATE POLICY "Read service cases by role"
  ON public.service_cases FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR public.current_user_role() = 'accountant'
    OR public.is_assigned_to_case(id)
  );

CREATE POLICY "Insert service cases by role"
  ON public.service_cases FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'staff'));

CREATE POLICY "Update service cases by role"
  ON public.service_cases FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_manager()
    OR public.is_assigned_to_case(id)
  )
  WITH CHECK (
    public.is_admin_or_manager()
    OR public.is_assigned_to_case(id)
  );

CREATE POLICY "Delete service cases admin only"
  ON public.service_cases FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- 5. WORKFLOW STEPS, SUBTASKS, COMMENTS
CREATE POLICY "Read case steps"
  ON public.case_steps FOR SELECT TO authenticated
  USING (public.is_admin_or_manager() OR public.current_user_role() = 'accountant' OR public.is_assigned_to_case(case_id));

CREATE POLICY "Modify case steps"
  ON public.case_steps FOR ALL TO authenticated
  USING (public.is_admin_or_manager() OR public.is_assigned_to_case(case_id))
  WITH CHECK (public.is_admin_or_manager() OR public.is_assigned_to_case(case_id));

CREATE POLICY "Read and modify subtasks"
  ON public.case_subtasks FOR ALL TO authenticated
  USING (public.is_admin_or_manager() OR public.is_assigned_to_case(case_id))
  WITH CHECK (public.is_admin_or_manager() OR public.is_assigned_to_case(case_id));

CREATE POLICY "Read comments"
  ON public.case_comments FOR SELECT TO authenticated
  USING (public.is_admin_or_manager() OR public.current_user_role() = 'accountant' OR public.is_assigned_to_case(case_id));

CREATE POLICY "Insert comments"
  ON public.case_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      public.is_admin_or_manager() OR public.current_user_role() = 'accountant' OR public.is_assigned_to_case(case_id)
    )
  );

-- 6. FINANCE (ẨN HOÀN TOÀN VỚI STAFF Ở TẦNG DATABASE)
CREATE POLICY "Finance read case_financials"
  ON public.case_financials FOR SELECT TO authenticated
  USING (public.can_view_finance());

CREATE POLICY "Finance manage case_financials"
  ON public.case_financials FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'accountant'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'accountant'));

CREATE POLICY "Finance read case_payments"
  ON public.case_payments FOR SELECT TO authenticated
  USING (public.can_view_finance());

CREATE POLICY "Finance manage case_payments"
  ON public.case_payments FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'accountant'))
  WITH CHECK (public.current_user_role() IN ('admin', 'accountant'));

CREATE POLICY "Finance read case_expenses"
  ON public.case_expenses FOR SELECT TO authenticated
  USING (public.can_view_finance());

CREATE POLICY "Finance manage case_expenses"
  ON public.case_expenses FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'accountant'))
  WITH CHECK (public.current_user_role() IN ('admin', 'accountant'));

-- 7. DOCUMENTS & FOLDERS
CREATE POLICY "Read document folders"
  ON public.document_folders FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR (case_id IS NOT NULL AND public.is_assigned_to_case(case_id))
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = customer_id AND c.assigned_staff_id = auth.uid())
  );

CREATE POLICY "Manage document folders"
  ON public.document_folders FOR ALL TO authenticated
  USING (
    public.is_admin_or_manager()
    OR (case_id IS NOT NULL AND public.is_assigned_to_case(case_id))
  )
  WITH CHECK (
    public.is_admin_or_manager()
    OR (case_id IS NOT NULL AND public.is_assigned_to_case(case_id))
  );

CREATE POLICY "Read documents by access scope"
  ON public.documents FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR (access_scope = 'all_staff' AND public.current_user_role() IS NOT NULL)
    OR (access_scope = 'finance' AND public.can_view_finance())
    OR (access_scope = 'case_team' AND case_id IS NOT NULL AND public.is_assigned_to_case(case_id))
    OR uploaded_by = auth.uid()
  );

CREATE POLICY "Upload documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_manager()
    OR public.current_user_role() = 'accountant'
    OR (case_id IS NOT NULL AND public.is_assigned_to_case(case_id))
  );

CREATE POLICY "Delete documents admin or manager only"
  ON public.documents FOR DELETE TO authenticated
  USING (public.is_admin_or_manager());

CREATE POLICY "Read document versions"
  ON public.document_versions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id)
  );

-- 8. NOTIFICATIONS & AUDIT LOGS
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Audit logs read by role"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.is_admin_or_manager()
    OR actor_id = auth.uid()
  );
