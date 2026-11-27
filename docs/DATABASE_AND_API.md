# Tài liệu Mô tả Database & API — Bông Sen Workspace

## 1. Cấu trúc Migrations (`supabase/migrations/`)
1. `0001_schema.sql`: Toàn bộ enum, sequence sinh mã tự động, 19 bảng chuẩn hóa và index tìm kiếm (`pg_trgm`).
2. `0002_functions_triggers.sql`:
   - `generate_employee_code()`, `generate_customer_code()`, `generate_case_code()`.
   - `handle_new_user()`: tự động tạo hồ sơ `profiles` khi tạo user qua Supabase Auth.
   - `handle_new_service_case()`: tự động tạo dòng tài chính `case_financials` và nhân bản các bước từ `workflow_templates` -> `case_steps`.
   - `recalculate_case_financials()`: tự động tính lại `paid_amount`, `incurred_cost`, `remaining_debt` khi có thu/chi.
   - `prevent_delete_completed_case()`: chặn xóa hồ sơ đã hoàn thành (`kanban_status = 'completed'`).
   - `notify_case_changes()`: sinh thông báo tự động khi giao việc / đổi trạng thái / cần bổ sung / hoàn thành.
   - `write_audit_log()`: ghi log mọi thao tác `INSERT/UPDATE/DELETE` trên các bảng nghiệp vụ cốt lõi.
3. `0003_rls_policies.sql`: Row Level Security cho 4 vai trò `admin`, `manager`, `staff`, `accountant`. Đặc biệt `case_financials`, `case_payments`, `case_expenses` bị khóa truy cập đối với `staff` ở tầng PostgreSQL.
4. `0004_storage_realtime.sql`: Bucket `case-documents` (private, tối đa 25MB/file) và bật Supabase Realtime cho `notifications`, `service_cases`, `case_steps`.
5. `0005_seed_data.sql`: Phòng ban, 4 nhóm dịch vụ A/B/C/D (23 dịch vụ chi tiết) và mẫu quy trình cho từng dịch vụ.
6. `0006_sample_demo_data.sql`: Dữ liệu mẫu khách hàng, hồ sơ và thu chi để kiểm thử.

## 2. Giao tiếp API (Supabase PostgREST, Storage & Edge Functions)
- **Auth API**: `supabase.auth.signInWithPassword`, `signOut`, `updateUser` (đổi mật khẩu), `onAuthStateChange`.
- **REST / PostgREST** (được bảo vệ bởi RLS):
  - `/rest/v1/profiles` — Danh bạ và thông tin nhân viên.
  - `/rest/v1/departments` — Phòng ban.
  - `/rest/v1/customers` — Khách hàng CRM.
  - `/rest/v1/service_categories`, `/rest/v1/services` — Danh mục dịch vụ.
  - `/rest/v1/service_cases`, `/rest/v1/case_steps`, `/rest/v1/case_subtasks`, `/rest/v1/case_comments`.
  - `/rest/v1/case_financials`, `/rest/v1/case_payments`, `/rest/v1/case_expenses`.
  - `/rest/v1/document_folders`, `/rest/v1/documents`, `/rest/v1/document_versions`.
  - `/rest/v1/notifications`, `/rest/v1/audit_logs`.
- **Edge Function `manage-employee`**:
  - `POST /functions/v1/manage-employee` với `action: "create" | "reset_password"` (chỉ `admin` gọi được; `SUPABASE_SERVICE_ROLE_KEY` chỉ nằm trên Edge Function).
