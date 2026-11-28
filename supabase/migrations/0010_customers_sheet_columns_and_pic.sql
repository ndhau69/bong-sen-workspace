-- ============================================================================
-- BÔNG SEN ACCOUNTING - MIGRATION 0010: CUSTOMERS SHEET COLUMNS, CUSTOM FIELDS & PIC DROPLIST
-- ============================================================================

-- 1. Mở rộng bảng customers theo cấu trúc Sheet Nhi_BCT + hỗ trợ cột động tùy chỉnh
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS sheet_no text,
  ADD COLUMN IF NOT EXISTS identity_number text,
  ADD COLUMN IF NOT EXISTS pic_name text,
  ADD COLUMN IF NOT EXISTS operating_status text DEFAULT 'Đang hoạt động',
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_customers_pic_name ON public.customers (pic_name);
CREATE INDEX IF NOT EXISTS idx_customers_operating_status ON public.customers (operating_status);

-- 2. Bảng định nghĩa danh sách PIC dạng droplist (user tự thêm/sửa/xóa)
CREATE TABLE IF NOT EXISTS public.customer_pic_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#2563eb',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Bảng cấu hình cột động cho Menu Khách hàng (thứ tự, ẩn/hiện, thêm cột tùy ý)
CREATE TABLE IF NOT EXISTS public.customer_column_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_key text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (
    field_type IN ('text', 'textarea', 'number', 'date', 'select', 'phone', 'email')
  ),
  is_system boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_customer_pic_options_updated_at ON public.customer_pic_options;
CREATE TRIGGER trg_customer_pic_options_updated_at
  BEFORE UPDATE ON public.customer_pic_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_customer_column_configs_updated_at ON public.customer_column_configs;
CREATE TRIGGER trg_customer_column_configs_updated_at
  BEFORE UPDATE ON public.customer_column_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS Policies
ALTER TABLE public.customer_pic_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_column_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read customer pic options" ON public.customer_pic_options;
CREATE POLICY "Authenticated users read customer pic options"
  ON public.customer_pic_options FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized staff manage customer pic options" ON public.customer_pic_options;
CREATE POLICY "Authorized staff manage customer pic options"
  ON public.customer_pic_options FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'staff'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'staff'));

DROP POLICY IF EXISTS "Authenticated users read customer column configs" ON public.customer_column_configs;
CREATE POLICY "Authenticated users read customer column configs"
  ON public.customer_column_configs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authorized staff manage customer column configs" ON public.customer_column_configs;
CREATE POLICY "Authorized staff manage customer column configs"
  ON public.customer_column_configs FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'staff'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'staff'));

-- 4. Seed giá trị PIC droplist ban đầu từ Sheet NHI_BCT
INSERT INTO public.customer_pic_options (name, color, sort_order, is_active) VALUES
  ('Nhi', '#2563eb', 1, true),
  ('Nhi - Đắc Xuân', '#7c3aed', 2, true),
  ('Bông Sen - Nhi', '#059669', 3, true),
  ('Bông Sen - Hằng', '#d97706', 4, true)
ON CONFLICT (name) DO NOTHING;

-- 5. Seed cấu hình cột mặc định: 8 cột chuẩn Sheet NHI_BCT hiển thị sẵn + các cột CRM mở rộng có thể bật/thêm bất kỳ lúc nào
INSERT INTO public.customer_column_configs (column_key, label, field_type, is_system, is_visible, sort_order, options) VALUES
  ('sheet_no', 'No.', 'text', true, true, 1, '[]'::jsonb),
  ('company_name', 'Doanh nghiệp', 'text', true, true, 2, '[]'::jsonb),
  ('identity_number', 'Số định danh', 'text', true, true, 3, '[]'::jsonb),
  ('tax_code', 'MST', 'text', true, true, 4, '[]'::jsonb),
  ('pic_name', 'PIC', 'select', true, true, 5, '[]'::jsonb),
  ('operating_status', 'Trạng thái', 'select', true, true, 6, '["Đang hoạt động", "Ngưng hoạt động", "Tạm ngưng"]'::jsonb),
  ('legal_representative', 'Chủ DN', 'text', true, true, 7, '[]'::jsonb),
  ('phone', 'SĐT', 'phone', true, true, 8, '[]'::jsonb),
  ('headquarters_address', 'Địa chỉ', 'text', true, false, 9, '[]'::jsonb),
  ('notes', 'Ghi chú', 'textarea', true, false, 10, '[]'::jsonb),
  ('email', 'Email', 'email', true, false, 11, '[]'::jsonb),
  ('business_type', 'Loại hình DN', 'select', true, false, 12, '[]'::jsonb),
  ('business_lines', 'Ngành nghề', 'text', true, false, 13, '[]'::jsonb),
  ('established_date', 'Ngày thành lập', 'date', true, false, 14, '[]'::jsonb),
  ('customer_code', 'Mã KH', 'text', true, false, 15, '[]'::jsonb)
ON CONFLICT (column_key) DO NOTHING;
