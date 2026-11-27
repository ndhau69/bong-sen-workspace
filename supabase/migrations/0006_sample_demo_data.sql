-- ============================================================================
-- BÔNG SEN WORKSPACE - MIGRATION 0006: SAMPLE DATA FOR TESTING
-- Chạy file này SAU KHI đã có ít nhất 1 user trong auth.users / profiles
-- ============================================================================

DO $$
DECLARE
  v_staff_id uuid;
  v_dept_phaply uuid;
  v_cust1 uuid;
  v_cust2 uuid;
  v_cust3 uuid;
  v_svc_tnhh1 uuid;
  v_svc_td_diachi uuid;
  v_svc_ketoan uuid;
  v_case1 uuid;
  v_case2 uuid;
  v_case3 uuid;
BEGIN
  SELECT id INTO v_staff_id FROM public.profiles ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO v_dept_phaply FROM public.departments WHERE code = 'PHAP-LY' LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE NOTICE 'Chưa có nhân viên trong bảng profiles. Hãy đăng ký user đầu tiên qua Supabase Auth rồi chạy lại.';
    RETURN;
  END IF;

  -- Cập nhật phòng ban cho user đầu tiên nếu chưa có
  UPDATE public.profiles SET department_id = COALESCE(department_id, v_dept_phaply) WHERE id = v_staff_id;

  -- Khách hàng mẫu
  INSERT INTO public.customers (company_name, tax_code, business_type, legal_representative, phone, email, headquarters_address, business_lines, established_date, assigned_staff_id, notes, created_by)
  VALUES
    ('Công ty TNHH Thương Mại Hải Vân Xanh', '0402198001', 'tnhh_1tv', 'Nguyễn Minh Tuấn', '0905111222', 'tuan@haivanxanh.vn', '128 Nguyễn Văn Linh, Thanh Khê, Đà Nẵng', 'Thương mại vật liệu xây dựng', '2024-03-15', v_staff_id, 'Khách hàng VIP sử dụng dịch vụ kế toán trọn gói', v_staff_id),
    ('Công ty Cổ Phần Công Nghệ Sông Hàn', '0402198002', 'co_phan', 'Trần Thị Mai Lan', '0913444555', 'lan@songhantech.vn', '45 Lê Duẩn, Hải Châu, Đà Nẵng', 'Phát triển phần mềm, tư vấn CNTT', '2025-01-10', v_staff_id, 'Đang làm thủ tục tăng vốn điều lệ', v_staff_id),
    ('Hộ Kinh Doanh Cà Phê Bến Bờ', '8391029384', 'ho_kinh_doanh', 'Lê Văn Hùng', '0988777666', 'hungcafe@gmail.com', '22 Võ Nguyên Giáp, Sơn Trà, Đà Nẵng', 'Dịch vụ ăn uống, giải khát', '2026-10-01', v_staff_id, 'Khách mới thành lập hộ kinh doanh', v_staff_id)
  ON CONFLICT (tax_code) DO NOTHING;

  SELECT id INTO v_cust1 FROM public.customers WHERE tax_code = '0402198001';
  SELECT id INTO v_cust2 FROM public.customers WHERE tax_code = '0402198002';
  SELECT id INTO v_cust3 FROM public.customers WHERE tax_code = '8391029384';

  SELECT id INTO v_svc_tnhh1 FROM public.services WHERE code = 'TL-TNHH1';
  SELECT id INTO v_svc_td_diachi FROM public.services WHERE code = 'TD-DIACHI';
  SELECT id INTO v_svc_ketoan FROM public.services WHERE code = 'KH-KETOAN';

  -- Tạo hồ sơ mẫu (chỉ tạo nếu chưa có hồ sơ nào)
  IF NOT EXISTS (SELECT 1 FROM public.service_cases) THEN
    INSERT INTO public.service_cases (customer_id, service_id, procedure_name, received_date, due_date, assigned_staff_id, priority, kanban_status, notes, created_by)
    VALUES (v_cust3, v_svc_tnhh1, 'Thành lập Công ty TNHH 1TV Bến Bờ', current_date - 2, current_date + 5, v_staff_id, 'high', 'in_progress', 'Đã thu đủ CCCD của chủ sở hữu', v_staff_id)
    RETURNING id INTO v_case1;

    INSERT INTO public.service_cases (customer_id, service_id, procedure_name, received_date, due_date, assigned_staff_id, priority, kanban_status, notes, created_by)
    VALUES (v_cust2, v_svc_td_diachi, 'Thay đổi địa chỉ trụ sở sang Quận Hải Châu', current_date - 5, current_date + 1, v_staff_id, 'urgent', 'waiting_authority', 'Đã nộp hồ sơ qua Cổng ĐKDN quốc gia', v_staff_id)
    RETURNING id INTO v_case2;

    INSERT INTO public.service_cases (customer_id, service_id, procedure_name, received_date, due_date, assigned_staff_id, priority, kanban_status, notes, created_by)
    VALUES (v_cust1, v_svc_ketoan, 'Kê khai thuế Quý IV/2026', current_date - 10, current_date + 20, v_staff_id, 'medium', 'completed', 'Đã nộp tờ khai và bàn giao biên lai', v_staff_id)
    RETURNING id INTO v_case3;

    -- Thanh toán mẫu
    INSERT INTO public.case_payments (case_id, payment_type, amount, payment_date, payment_method, reference_no, recorded_by, notes)
    VALUES
      (v_case1, 'deposit', 750000, current_date - 2, 'bank_transfer', 'VCB-998123', v_staff_id, 'Đặt cọc 50%'),
      (v_case3, 'final', 1500000, current_date - 1, 'bank_transfer', 'VCB-998456', v_staff_id, 'Thanh toán đủ');

    INSERT INTO public.case_expenses (case_id, title, amount, expense_date, is_reimbursable, recorded_by)
    VALUES
      (v_case1, 'Lệ phí công bố thông tin doanh nghiệp', 100000, current_date - 1, false, v_staff_id);
  END IF;
END $$;
