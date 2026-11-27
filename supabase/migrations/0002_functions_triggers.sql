-- ============================================================================
-- BÔNG SEN WORKSPACE - MIGRATION 0002: FUNCTIONS & TRIGGERS
-- ============================================================================

-- 1. AUTO UPDATE updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cases_updated_at BEFORE UPDATE ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_case_steps_updated_at BEFORE UPDATE ON public.case_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. AUTO GENERATE CODES (NV-0001, KH-0001, HS-2026-0001)
CREATE OR REPLACE FUNCTION public.generate_employee_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
    NEW.employee_code := 'NV-' || lpad(nextval('public.seq_employee_code')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_code BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.generate_employee_code();

CREATE OR REPLACE FUNCTION public.generate_customer_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_code IS NULL OR btrim(NEW.customer_code) = '' THEN
    NEW.customer_code := 'KH-' || lpad(nextval('public.seq_customer_code')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customers_code BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.generate_customer_code();

CREATE OR REPLACE FUNCTION public.generate_case_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.case_code IS NULL OR btrim(NEW.case_code) = '' THEN
    NEW.case_code := 'HS-' || to_char(COALESCE(NEW.received_date, current_date), 'YYYY') || '-' ||
                     lpad(nextval('public.seq_case_code')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cases_code BEFORE INSERT ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.generate_case_code();

-- 3. HANDLE NEW AUTH USER -> AUTO CREATE PROFILE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'role', '')::public.app_role,
    'staff'::public.app_role
  );

  INSERT INTO public.profiles (id, full_name, email, phone, role, job_title)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data ->> 'phone',
    v_role,
    NEW.raw_user_meta_data ->> 'job_title'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. AUTO INSTANTIATE WORKFLOW STEPS & FINANCIAL ROW ON CASE INSERT
CREATE OR REPLACE FUNCTION public.handle_new_service_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_price numeric(15,2) := 0;
  v_template_id uuid;
  v_step record;
  v_cursor_time timestamptz;
BEGIN
  SELECT default_price INTO v_default_price FROM public.services WHERE id = NEW.service_id;

  INSERT INTO public.case_financials (case_id, contract_value)
  VALUES (NEW.id, COALESCE(v_default_price, 0))
  ON CONFLICT (case_id) DO NOTHING;

  SELECT id INTO v_template_id
  FROM public.workflow_templates
  WHERE service_id = NEW.service_id AND is_active = true
  LIMIT 1;

  IF v_template_id IS NOT NULL THEN
    v_cursor_time := COALESCE(NEW.received_date::timestamptz, now());
    FOR v_step IN
      SELECT * FROM public.workflow_template_steps
      WHERE template_id = v_template_id
      ORDER BY step_order ASC
    LOOP
      v_cursor_time := v_cursor_time + make_interval(hours => v_step.default_duration_hours);
      INSERT INTO public.case_steps (
        case_id, step_order, title, description, assignee_id, due_date, status
      )
      VALUES (
        NEW.id,
        v_step.step_order,
        v_step.title,
        v_step.description,
        NEW.assigned_staff_id,
        v_cursor_time,
        CASE WHEN v_step.step_order = 1 THEN 'in_progress'::public.step_status ELSE 'todo'::public.step_status END
      );
    END LOOP;
  END IF;

  IF NEW.assigned_staff_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, entity_type, entity_id)
    VALUES (
      NEW.assigned_staff_id,
      'task_assigned',
      'Bạn được giao hồ sơ mới',
      'Hồ sơ ' || NEW.case_code || ' (' || NEW.procedure_name || ') đã được phân công cho bạn.',
      'case',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_case_insert
  AFTER INSERT ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_service_case();

-- 5. RECALCULATE CASE FINANCIALS ON PAYMENT / EXPENSE CHANGES
CREATE OR REPLACE FUNCTION public.recalculate_case_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_id uuid;
  v_paid numeric(15,2);
  v_cost numeric(15,2);
BEGIN
  v_case_id := COALESCE(NEW.case_id, OLD.case_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.case_payments WHERE case_id = v_case_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_cost FROM public.case_expenses WHERE case_id = v_case_id;

  INSERT INTO public.case_financials (case_id, paid_amount, incurred_cost)
  VALUES (v_case_id, v_paid, v_cost)
  ON CONFLICT (case_id) DO UPDATE
  SET paid_amount = EXCLUDED.paid_amount,
      incurred_cost = EXCLUDED.incurred_cost,
      updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalc_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.case_payments
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_case_financials();

CREATE TRIGGER trg_recalc_on_expense
  AFTER INSERT OR UPDATE OR DELETE ON public.case_expenses
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_case_financials();

-- 6. PROTECT COMPLETED CASES FROM DELETION
CREATE OR REPLACE FUNCTION public.prevent_delete_completed_case()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.kanban_status = 'completed' THEN
    RAISE EXCEPTION 'Không được phép xóa hồ sơ đã hoàn thành (%).', OLD.case_code;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_delete_completed_case
  BEFORE DELETE ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_completed_case();

-- 7. NOTIFICATIONS ON STATUS CHANGE & ASSIGNMENT
CREATE OR REPLACE FUNCTION public.notify_case_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notif_type public.notification_type;
  v_title text;
  v_msg text;
BEGIN
  IF OLD.assigned_staff_id IS DISTINCT FROM NEW.assigned_staff_id AND NEW.assigned_staff_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, entity_type, entity_id)
    VALUES (
      NEW.assigned_staff_id,
      'task_assigned',
      'Chuyển giao hồ sơ',
      'Hồ sơ ' || NEW.case_code || ' đã được chuyển giao cho bạn.',
      'case',
      NEW.id
    );
  END IF;

  IF OLD.kanban_status IS DISTINCT FROM NEW.kanban_status AND NEW.assigned_staff_id IS NOT NULL THEN
    IF NEW.kanban_status = 'need_supplement' THEN
      v_notif_type := 'supplement_required';
      v_title := 'Hồ sơ cần bổ sung';
    ELSIF NEW.kanban_status = 'completed' THEN
      v_notif_type := 'case_completed';
      v_title := 'Hồ sơ đã hoàn thành';
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    ELSE
      v_notif_type := 'status_changed';
      v_title := 'Cập nhật trạng thái hồ sơ';
    END IF;

    v_msg := 'Hồ sơ ' || NEW.case_code || ' đã chuyển sang trạng thái ' || NEW.kanban_status::text || '.';

    INSERT INTO public.notifications (recipient_id, type, title, message, entity_type, entity_id)
    VALUES (NEW.assigned_staff_id, v_notif_type, v_title, v_msg, 'case', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_case_before_update_notify
  BEFORE UPDATE ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_changes();

-- 8. GENERIC AUDIT LOG TRIGGER
CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.audit_action;
  v_entity_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_entity_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_entity_id := NEW.id;
  ELSE
    v_action := 'DELETE';
    v_entity_id := OLD.id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_table, entity_id, action, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    v_entity_id,
    v_action,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_cases AFTER INSERT OR UPDATE OR DELETE ON public.service_cases
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.case_payments
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_expenses AFTER INSERT OR UPDATE OR DELETE ON public.case_expenses
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_documents AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
