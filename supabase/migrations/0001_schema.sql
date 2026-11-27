-- ============================================================================
-- BÔNG SEN WORKSPACE - MIGRATION 0001: CORE SCHEMA
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff', 'accountant');

CREATE TYPE public.business_type AS ENUM (
  'tnhh_1tv',
  'tnhh_2tv',
  'co_phan',
  'tu_nhan',
  'ho_kinh_doanh',
  'other'
);

CREATE TYPE public.case_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TYPE public.kanban_status AS ENUM (
  'new_received',       -- Mới tiếp nhận
  'pending',            -- Chờ xử lý
  'in_progress',        -- Đang thực hiện
  'waiting_customer',   -- Chờ khách hàng
  'waiting_authority',  -- Chờ cơ quan nhà nước
  'need_supplement',    -- Cần bổ sung
  'completed',          -- Hoàn thành
  'cancelled'           -- Đã hủy
);

CREATE TYPE public.step_status AS ENUM (
  'todo',
  'in_progress',
  'waiting',
  'blocked',
  'completed',
  'skipped'
);

CREATE TYPE public.payment_type AS ENUM ('deposit', 'installment', 'final');
CREATE TYPE public.payment_method AS ENUM ('cash', 'bank_transfer', 'card', 'other');
CREATE TYPE public.document_access_scope AS ENUM ('case_team', 'managers_only', 'all_staff', 'finance');

CREATE TYPE public.notification_type AS ENUM (
  'task_assigned',
  'deadline_soon',
  'overdue',
  'status_changed',
  'supplement_required',
  'case_completed',
  'comment_mention'
);

CREATE TYPE public.audit_action AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRANSFER',
  'STATUS_CHANGE',
  'DOWNLOAD'
);

-- 2. SEQUENCES FOR AUTO CODES
CREATE SEQUENCE IF NOT EXISTS public.seq_employee_code START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_customer_code START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_case_code START 1;

-- 3. DEPARTMENTS & PROFILES
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code text UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  avatar_url text,
  role public.app_role NOT NULL DEFAULT 'staff',
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  job_title text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. CUSTOMERS (CRM)
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL UNIQUE,
  company_name text NOT NULL,
  tax_code text UNIQUE,
  business_type public.business_type NOT NULL DEFAULT 'tnhh_1tv',
  legal_representative text,
  phone text,
  email text,
  headquarters_address text,
  business_lines text,
  established_date date,
  assigned_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  deleted_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_company_trgm ON public.customers USING gin (company_name gin_trgm_ops);
CREATE INDEX idx_customers_tax_code ON public.customers (tax_code);
CREATE INDEX idx_customers_phone ON public.customers (phone);
CREATE INDEX idx_customers_assigned_staff ON public.customers (assigned_staff_id);

-- 5. SERVICE CATALOG & WORKFLOW TEMPLATES
CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.service_categories(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  default_price numeric(15,2) NOT NULL DEFAULT 0,
  default_duration_days int NOT NULL DEFAULT 7,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL UNIQUE REFERENCES public.services(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_template_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  title text NOT NULL,
  description text,
  default_duration_hours int NOT NULL DEFAULT 24,
  default_role public.app_role NOT NULL DEFAULT 'staff',
  is_required boolean NOT NULL DEFAULT true,
  UNIQUE (template_id, step_order)
);

-- 6. SERVICE CASES (HỒ SƠ DỊCH VỤ)
CREATE TABLE public.service_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_code text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  procedure_name text NOT NULL,
  received_date date NOT NULL DEFAULT current_date,
  due_date date,
  completed_at timestamptz,
  assigned_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  priority public.case_priority NOT NULL DEFAULT 'medium',
  kanban_status public.kanban_status NOT NULL DEFAULT 'new_received',
  kanban_order numeric NOT NULL DEFAULT 0,
  delay_reason text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cases_customer ON public.service_cases (customer_id);
CREATE INDEX idx_cases_service ON public.service_cases (service_id);
CREATE INDEX idx_cases_staff ON public.service_cases (assigned_staff_id);
CREATE INDEX idx_cases_status ON public.service_cases (kanban_status);
CREATE INDEX idx_cases_due_date ON public.service_cases (due_date);

-- 7. CASE WORKFLOW STEPS, SUBTASKS & COMMENTS
CREATE TABLE public.case_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  title text NOT NULL,
  description text,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at timestamptz,
  due_date timestamptz,
  completed_at timestamptz,
  status public.step_status NOT NULL DEFAULT 'todo',
  delay_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, step_order)
);

CREATE INDEX idx_case_steps_case ON public.case_steps (case_id);
CREATE INDEX idx_case_steps_assignee ON public.case_steps (assignee_id);

CREATE TABLE public.case_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.case_steps(id) ON DELETE CASCADE,
  title text NOT NULL,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date timestamptz,
  is_done boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.case_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.case_steps(id) ON DELETE SET NULL,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  mentions uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. FINANCE (TÁCH BẢNG ĐỂ BẢO MẬT TUYỆT ĐỐI BẰNG RLS)
CREATE TABLE public.case_financials (
  case_id uuid PRIMARY KEY REFERENCES public.service_cases(id) ON DELETE CASCADE,
  contract_value numeric(15,2) NOT NULL DEFAULT 0 CHECK (contract_value >= 0),
  incurred_cost numeric(15,2) NOT NULL DEFAULT 0 CHECK (incurred_cost >= 0),
  paid_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_debt numeric(15,2) GENERATED ALWAYS AS (GREATEST(contract_value - paid_amount, 0)) STORED,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.case_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  payment_type public.payment_type NOT NULL DEFAULT 'installment',
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT current_date,
  payment_method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  reference_no text,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_payments_case ON public.case_payments (case_id);
CREATE INDEX idx_case_payments_date ON public.case_payments (payment_date);

CREATE TABLE public.case_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.service_cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT current_date,
  is_reimbursable boolean NOT NULL DEFAULT false,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. DOCUMENTS & FOLDERS
CREATE TABLE public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.service_cases(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.document_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.service_cases(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.case_steps(id) ON DELETE SET NULL,
  folder_id uuid REFERENCES public.document_folders(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  access_scope public.document_access_scope NOT NULL DEFAULT 'case_team',
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version int NOT NULL,
  storage_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  change_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. NOTIFICATIONS & AUDIT LOGS
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON public.notifications (recipient_id, is_read, created_at DESC);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  action public.audit_action NOT NULL,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_table, entity_id, created_at DESC);
