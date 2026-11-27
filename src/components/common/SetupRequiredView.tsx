import { AlertCircle, Database, Terminal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SetupRequiredView() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full border-blue-200 shadow-lg">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Bông Sen" className="h-10 w-10 rounded-lg object-contain bg-blue-50 p-1" />
            <div>
              <CardTitle className="text-xl text-blue-900">Kết nối Supabase để khởi chạy Bông Sen Workspace</CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Hệ thống yêu cầu kết nối PostgreSQL & Supabase Auth thực tế (không dùng dữ liệu giả trên trình duyệt).
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-4 text-sm text-slate-700">
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              Chưa tìm thấy cấu hình <code className="font-mono font-semibold">VITE_SUPABASE_URL</code> và{' '}
              <code className="font-mono font-semibold">VITE_SUPABASE_ANON_KEY</code> trong file{' '}
              <code className="font-mono">.env.local</code>.
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Database className="h-4 w-4 text-primary" />
              <span>Bước 1: Chạy SQL Migrations trên Supabase</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Mở Supabase Dashboard → <strong>SQL Editor</strong> và chạy tuần tự các file trong thư mục{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded">supabase/migrations/</code> từ{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded">0001_schema.sql</code> đến{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 rounded">0006_sample_demo_data.sql</code>.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Terminal className="h-4 w-4 text-primary" />
              <span>Bước 2: Tạo file .env.local</span>
            </div>
            <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>`}
            </pre>
            <p className="text-xs text-slate-500">
              Sau khi lưu file <code className="font-mono">.env.local</code>, khởi động lại server Vite (<code className="font-mono">npm run dev</code>).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
