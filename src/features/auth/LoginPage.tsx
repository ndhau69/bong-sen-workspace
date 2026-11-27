import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useAuth } from './AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function LoginPage() {
  const { session, profile, signIn, authError, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!loading && session && profile) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSubmitting(true)
    const { error } = await signIn(email.trim(), password)
    if (error) setErrorMsg(error)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-white shadow-sm border border-blue-100 flex items-center justify-center p-2">
            <img src="/logo.png" alt="Bông Sen Accounting" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">BÔNG SEN WORKSPACE</h1>
          <p className="text-xs text-slate-500">
            Hệ thống Quản lý Khách hàng, Hồ sơ &amp; Tài chính Nội bộ
          </p>
        </div>

        <Card className="border-slate-200/90 shadow-lg">
          <CardHeader className="pb-3">
            <h2 className="text-base font-semibold text-slate-900">Đăng nhập tài khoản nhân sự</h2>
            <p className="text-xs text-slate-500">
              Sử dụng tài khoản nội bộ được cấp bởi Quản trị viên Bông Sen Accounting.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {(errorMsg || authError) && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  {errorMsg || authError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email công ty</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nhanvien@ketoanbongsen.vn"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pl-9 pr-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5"
                    aria-label="Hiện/ẩn mật khẩu"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-10" disabled={submitting}>
                {submitting ? 'Đang xác thực...' : 'Đăng nhập vào hệ thống'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
          <span>Bảo mật bằng Supabase Auth &amp; PostgreSQL Row Level Security</span>
        </div>
      </div>
    </div>
  )
}
