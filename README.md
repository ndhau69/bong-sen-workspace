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

## 4. Tự động Deploy lên Netlify qua GitHub Actions

Workflow `.github/workflows/deploy-netlify.yml` sẽ tự build `dist/` trên GitHub Actions và đẩy bản build sang Netlify mỗi khi push nhánh `main` (không tốn build credit của Netlify).

Cấu hình 4 Repository Secrets tại **GitHub → Settings → Secrets and variables → Actions**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `NETLIFY_SITE_ID`
- `NETLIFY_AUTH_TOKEN` (tạo tại Netlify → User settings → Applications → Personal access tokens)

## 5. Backup tự động Source Code (Local & GitHub)

- **Local (`d:\Backup\bong-sen-workspace\`):** Git hook `.git/hooks/pre-push` tự động chạy `scripts/backup.ps1` mỗi khi `git push` để nén toàn bộ mã nguồn (kèm `.env.local`, loại trừ `node_modules`/`dist`) thành file `.zip` theo timestamp (giữ tối đa 20 bản gần nhất). Cũng có thể chạy tay bằng `npm run backup`.
- **Cloud (GitHub Actions):** Workflow `.github/workflows/backup-snapshot.yml` tự động nén mã nguồn sạch và lưu Artifact trên GitHub Actions trong 90 ngày mỗi khi push lên `main`.
