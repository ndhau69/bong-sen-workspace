-- ============================================================================
-- BÔNG SEN WORKSPACE - MIGRATION 0005: DANH MỤC DỊCH VỤ & QUY TRÌNH MẪU
-- ============================================================================

-- 1. PHÒNG BAN MẶC ĐỊNH
INSERT INTO public.departments (code, name, description) VALUES
  ('BGD', 'Ban Giám Đốc', 'Điều hành chung Công ty TNHH TM-DV Kế Toán Bông Sen'),
  ('PHAP-LY', 'Phòng Pháp Lý Doanh Nghiệp', 'Thành lập, thay đổi ĐKKD, giải thể, giấy phép'),
  ('KE-TOAN', 'Phòng Kế Toán Thuế', 'Kế toán trọn gói, báo cáo tài chính, quyết toán thuế'),
  ('TAI-CHINH', 'Phòng Tài Chính - Thu Ngân', 'Quản lý hợp đồng, thanh toán, công nợ')
ON CONFLICT (code) DO NOTHING;

-- 2. 4 NHÓM DỊCH VỤ (A, B, C, D)
INSERT INTO public.service_categories (code, name, sort_order) VALUES
  ('A', 'A. Thành lập doanh nghiệp', 1),
  ('B', 'B. Thay đổi đăng ký kinh doanh', 2),
  ('C', 'C. Giải thể doanh nghiệp', 3),
  ('D', 'D. Các dịch vụ khác', 4)
ON CONFLICT (code) DO NOTHING;

-- 3. CHI TIẾT DANH MỤC DỊCH VỤ
WITH cats AS (SELECT id, code FROM public.service_categories)
INSERT INTO public.services (category_id, code, name, default_price, default_duration_days) VALUES
  -- A. Thành lập doanh nghiệp
  ((SELECT id FROM cats WHERE code='A'), 'TL-TNHH1', 'Thành lập công ty TNHH 1 thành viên', 1500000, 7),
  ((SELECT id FROM cats WHERE code='A'), 'TL-TNHH2', 'Thành lập công ty TNHH 2 thành viên trở lên', 1500000, 7),
  ((SELECT id FROM cats WHERE code='A'), 'TL-CP', 'Thành lập công ty cổ phần', 1800000, 7),
  ((SELECT id FROM cats WHERE code='A'), 'TL-DNTN', 'Thành lập doanh nghiệp tư nhân', 1500000, 7),
  ((SELECT id FROM cats WHERE code='A'), 'TL-HKD', 'Thành lập hộ kinh doanh', 1200000, 5),

  -- B. Thay đổi đăng ký kinh doanh
  ((SELECT id FROM cats WHERE code='B'), 'TD-TEN', 'Thay đổi tên doanh nghiệp', 1000000, 5),
  ((SELECT id FROM cats WHERE code='B'), 'TD-DIACHI', 'Thay đổi địa chỉ trụ sở', 1000000, 5),
  ((SELECT id FROM cats WHERE code='B'), 'TD-DDPL', 'Thay đổi người đại diện pháp luật', 1200000, 5),
  ((SELECT id FROM cats WHERE code='B'), 'TD-VON', 'Thay đổi vốn điều lệ', 1000000, 5),
  ((SELECT id FROM cats WHERE code='B'), 'TD-TVCD', 'Thay đổi thành viên/cổ đông', 1200000, 5),
  ((SELECT id FROM cats WHERE code='B'), 'TD-NGANH', 'Bổ sung, thay đổi ngành nghề', 1000000, 5),
  ((SELECT id FROM cats WHERE code='B'), 'TD-THUE', 'Thay đổi thông tin đăng ký thuế', 800000, 5),
  ((SELECT id FROM cats WHERE code='B'), 'TD-KHAC', 'Các thủ tục thay đổi khác', 1000000, 7),

  -- C. Giải thể doanh nghiệp
  ((SELECT id FROM cats WHERE code='C'), 'GT-DN', 'Giải thể doanh nghiệp trọn gói', 3500000, 30),

  -- D. Các dịch vụ khác
  ((SELECT id FROM cats WHERE code='D'), 'KH-HKD', 'Đăng ký hộ kinh doanh', 1200000, 5),
  ((SELECT id FROM cats WHERE code='D'), 'KH-TAMNGUNG', 'Tạm ngừng kinh doanh', 1000000, 5),
  ((SELECT id FROM cats WHERE code='D'), 'KH-CKS', 'Chữ ký số', 1500000, 2),
  ((SELECT id FROM cats WHERE code='D'), 'KH-HDDT', 'Hóa đơn điện tử', 1200000, 3),
  ((SELECT id FROM cats WHERE code='D'), 'KH-GPVT', 'Giấy phép vận tải', 2500000, 10),
  ((SELECT id FROM cats WHERE code='D'), 'KH-PHUHIEU', 'Phù hiệu xe', 800000, 3),
  ((SELECT id FROM cats WHERE code='D'), 'KH-KETOAN', 'Dịch vụ kế toán thuế', 1500000, 30),
  ((SELECT id FROM cats WHERE code='D'), 'KH-BCTC', 'Báo cáo tài chính', 3000000, 15),
  ((SELECT id FROM cats WHERE code='D'), 'KH-QTT', 'Quyết toán thuế TNCN, TNDN', 3500000, 20)
ON CONFLICT (code) DO NOTHING;

-- 4. TẠO WORKFLOW TEMPLATE 12 BƯỚC CHO NHÓM THÀNH LẬP DOANH NGHIỆP
DO $$
DECLARE
  v_svc record;
  v_tpl_id uuid;
BEGIN
  FOR v_svc IN
    SELECT s.id, s.name FROM public.services s
    JOIN public.service_categories c ON c.id = s.category_id
    WHERE c.code = 'A'
  LOOP
    INSERT INTO public.workflow_templates (service_id, name, description)
    VALUES (v_svc.id, 'Quy trình chuẩn - ' || v_svc.name, 'Quy trình 12 bước thành lập doanh nghiệp chuẩn Bông Sen')
    ON CONFLICT (service_id) DO NOTHING
    RETURNING id INTO v_tpl_id;

    IF v_tpl_id IS NOT NULL THEN
      INSERT INTO public.workflow_template_steps (template_id, step_order, title, default_duration_hours, default_role) VALUES
        (v_tpl_id, 1, 'Tiếp nhận thông tin khách hàng', 4, 'staff'),
        (v_tpl_id, 2, 'Tư vấn và báo giá', 8, 'staff'),
        (v_tpl_id, 3, 'Xác nhận sử dụng dịch vụ', 12, 'staff'),
        (v_tpl_id, 4, 'Thu thập thông tin và giấy tờ', 24, 'staff'),
        (v_tpl_id, 5, 'Soạn thảo hồ sơ', 16, 'staff'),
        (v_tpl_id, 6, 'Kiểm tra hồ sơ nội bộ', 8, 'manager'),
        (v_tpl_id, 7, 'Nộp hồ sơ', 8, 'staff'),
        (v_tpl_id, 8, 'Theo dõi kết quả xử lý', 72, 'staff'),
        (v_tpl_id, 9, 'Bổ sung hồ sơ (nếu có)', 24, 'staff'),
        (v_tpl_id, 10, 'Nhận kết quả đăng ký doanh nghiệp', 12, 'staff'),
        (v_tpl_id, 11, 'Bàn giao khách hàng', 8, 'staff'),
        (v_tpl_id, 12, 'Hoàn tất và lưu trữ hồ sơ', 8, 'accountant');
    END IF;
  END LOOP;
END $$;

-- 5. WORKFLOW TEMPLATE CHO NHÓM B (THAY ĐỔI ĐKKD), C (GIẢI THỂ), D (KHÁC)
DO $$
DECLARE
  v_svc record;
  v_tpl_id uuid;
BEGIN
  -- Nhóm B: Thay đổi ĐKKD
  FOR v_svc IN
    SELECT s.id, s.name FROM public.services s
    JOIN public.service_categories c ON c.id = s.category_id WHERE c.code = 'B'
  LOOP
    INSERT INTO public.workflow_templates (service_id, name, description)
    VALUES (v_svc.id, 'Quy trình thay đổi ĐKKD - ' || v_svc.name, 'Quy trình chuẩn thay đổi đăng ký kinh doanh')
    ON CONFLICT (service_id) DO NOTHING RETURNING id INTO v_tpl_id;

    IF v_tpl_id IS NOT NULL THEN
      INSERT INTO public.workflow_template_steps (template_id, step_order, title, default_duration_hours, default_role) VALUES
        (v_tpl_id, 1, 'Tiếp nhận & kiểm tra thông tin hiện tại', 8, 'staff'),
        (v_tpl_id, 2, 'Tư vấn báo giá & xác nhận dịch vụ', 12, 'staff'),
        (v_tpl_id, 3, 'Soạn thảo hồ sơ thay đổi & gửi khách ký', 24, 'staff'),
        (v_tpl_id, 4, 'Kiểm tra nội bộ & nộp Sở KH&ĐT', 16, 'manager'),
        (v_tpl_id, 5, 'Theo dõi / bổ sung hồ sơ (nếu có)', 72, 'staff'),
        (v_tpl_id, 6, 'Nhận giấy phép mới & bàn giao khách hàng', 12, 'staff');
    END IF;
  END LOOP;

  -- Nhóm C: Giải thể
  FOR v_svc IN
    SELECT s.id, s.name FROM public.services s
    JOIN public.service_categories c ON c.id = s.category_id WHERE c.code = 'C'
  LOOP
    INSERT INTO public.workflow_templates (service_id, name, description)
    VALUES (v_svc.id, 'Quy trình giải thể - ' || v_svc.name, 'Quy trình giải thể 5 giai đoạn')
    ON CONFLICT (service_id) DO NOTHING RETURNING id INTO v_tpl_id;

    IF v_tpl_id IS NOT NULL THEN
      INSERT INTO public.workflow_template_steps (template_id, step_order, title, default_duration_hours, default_role) VALUES
        (v_tpl_id, 1, 'Tiếp nhận yêu cầu giải thể', 12, 'staff'),
        (v_tpl_id, 2, 'Kiểm tra tình trạng pháp lý và nghĩa vụ thuế', 72, 'accountant'),
        (v_tpl_id, 3, 'Thực hiện thủ tục chấm dứt hoạt động & đóng MST', 240, 'staff'),
        (v_tpl_id, 4, 'Theo dõi nghĩa vụ thuế và hồ sơ liên quan', 168, 'accountant'),
        (v_tpl_id, 5, 'Hoàn tất thủ tục giải thể & lưu trữ', 24, 'manager');
    END IF;
  END LOOP;

  -- Nhóm D: Dịch vụ khác
  FOR v_svc IN
    SELECT s.id, s.name FROM public.services s
    JOIN public.service_categories c ON c.id = s.category_id WHERE c.code = 'D'
  LOOP
    INSERT INTO public.workflow_templates (service_id, name, description)
    VALUES (v_svc.id, 'Quy trình chuẩn - ' || v_svc.name, 'Quy trình xử lý dịch vụ chuẩn')
    ON CONFLICT (service_id) DO NOTHING RETURNING id INTO v_tpl_id;

    IF v_tpl_id IS NOT NULL THEN
      INSERT INTO public.workflow_template_steps (template_id, step_order, title, default_duration_hours, default_role) VALUES
        (v_tpl_id, 1, 'Tiếp nhận yêu cầu & chứng từ', 12, 'staff'),
        (v_tpl_id, 2, 'Xử lý nghiệp vụ & đối soát', 48, 'staff'),
        (v_tpl_id, 3, 'Kiểm tra chéo & hoàn thiện', 24, 'manager'),
        (v_tpl_id, 4, 'Bàn giao kết quả & tất toán', 12, 'accountant');
    END IF;
  END LOOP;
END $$;
