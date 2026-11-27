# BÔNG SEN WORKSPACE — Business Management PWA

Ứng dụng Web App (PWA) quản lý tập trung khách hàng, hồ sơ dịch vụ, quy trình xử lý công việc (Workflow + Kanban), nhân viên, tài liệu và tài chính dành cho **Công ty TNHH TM-DV Kế Toán Bông Sen**.

## 1. Hướng dẫn thiết lập Supabase (Database & Auth thực tế)

1. Tạo project mới trên [Supabase](https://supabase.com).
2. Mở **SQL Editor** và chạy tuần tự các file migration trong `supabase/migrations/`:
   - `0001_schema.sql`
   - `0002_functions_triggers.sql`
   - `0003_rls_policies.sql`
   - `0004_storage_realtime.sql`
   - `0005_seed_data.sql`
   - `0007_sync_logs.sql` (nhật ký đồng bộ Google Sheets)
3. Tạo tài khoản Admin đầu tiên trong **Authentication → Users** (hoặc đăng ký), sau đó chạy SQL nâng quyền thành `admin`:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@ketoanbongsen.vn';
   ```
4. *(Tùy chọn test nhanh)* Chạy `0006_sample_demo_data.sql` để tạo sẵn khách hàng, hồ sơ và giao dịch mẫu.
5. *(Tùy chọn)* Deploy Edge Functions:
   - `supabase functions deploy manage-employee` (Admin tạo nhân viên & reset mật khẩu).
   - `supabase functions deploy sync-google-sheets` (Đồng bộ 1 chiều sang Google Sheets bằng `docs/google-apps-script-sync.gs`, cấu hình Secrets `GOOGLE_SHEETS_WEBHOOK_URL` và `GOOGLE_SHEETS_SYNC_SECRET`).

## 2. Cấu hình môi trường & Chạy local

```bash
cp .env.example .env.local
# Điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào .env.local
npm install
npm run dev
```

## 3. Cài đặt PWA trên iOS / Android / Windows

- **iOS (Safari):** Mở URL ứng dụng → bấm **Chia sẻ (Share)** → **Thêm vào Màn hình chính (Add to Home Screen)**.
- **Android / Windows (Chrome / Edge):** Bấm nút **Cài đặt** trên thanh địa chỉ hoặc banner gợi ý góc màn hình.
- **Bảo mật dữ liệu Offline:** Service Worker chỉ cache App Shell (`NetworkOnly` cho toàn bộ API `/rest/`, `/auth/`, `/storage/` của Supabase) và tự xóa cache khi đăng xuất.
