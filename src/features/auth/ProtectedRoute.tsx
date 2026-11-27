import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import type { AppRole } from '@/types/database'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: AppRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-xs text-slate-500">Đang tải phiên làm việc...</p>
        </div>
      </div>
    )
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return (
      <div className="p-8 text-center">
        <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-base font-semibold text-red-800">Không có quyền truy cập</h2>
          <p className="mt-1 text-xs text-red-700">
            Vai trò hiện tại của bạn không được phép truy cập phân hệ này.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
