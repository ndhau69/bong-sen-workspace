import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Briefcase,
  CheckSquare,
  UserCog,
  Wallet,
  Files,
  BarChart3,
  Settings,
  Search,
  Menu,
  X,
  LogOut,
  KeyRound,
  WifiOff
} from 'lucide-react'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import { ROLE_SHORT_LABELS } from '@/lib/formatters'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  visible: boolean
}

export function AppShell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [pwdDialogOpen, setPwdDialogOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const navItems: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    { to: '/customers', label: 'Khách hàng', icon: Users, visible: true },
    { to: '/cases', label: 'Hồ sơ dịch vụ', icon: Briefcase, visible: true },
    { to: '/tasks', label: 'Công việc', icon: CheckSquare, visible: true },
    { to: '/kanban', label: 'Kanban', icon: FolderKanban, visible: true },
    { to: '/employees', label: 'Nhân viên', icon: UserCog, visible: true },
    { to: '/finance', label: 'Tài chính', icon: Wallet, visible: Permissions.canViewFinance(profile?.role) },
    { to: '/documents', label: 'Tài liệu', icon: Files, visible: true },
    { to: '/reports', label: 'Báo cáo', icon: BarChart3, visible: true },
    { to: '/settings', label: 'Cài đặt', icon: Settings, visible: true }
  ].filter((item) => item.visible)

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!globalSearch.trim()) return
    navigate(`/cases?q=${encodeURIComponent(globalSearch.trim())}`)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast.error('Mật khẩu mới tối thiểu 6 ký tự')
      return
    }
    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPwd(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Đã đổi mật khẩu thành công')
    setNewPassword('')
    setPwdDialogOpen(false)
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Bông Sen" className="h-9 w-9 rounded-lg object-contain bg-blue-50 p-1" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">BÔNG SEN</div>
          <div className="text-[11px] font-medium text-primary truncate">WORKSPACE</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-primary'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-slate-100 p-3 space-y-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold text-slate-900 truncate">{profile?.full_name}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {profile?.role ? ROLE_SHORT_LABELS[profile.role] : ''} • {profile?.employee_code || 'NV'}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-xs text-slate-600"
            onClick={() => setPwdDialogOpen(true)}
          >
            <KeyRound className="h-3.5 w-3.5" />
            Đổi MK
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 justify-start text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => signOut()}
          >
            <LogOut className="h-3.5 w-3.5" />
            Đăng xuất
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 sticky top-0 h-screen">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 max-w-[80vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!isOnline && (
          <div className="bg-amber-600 text-white px-4 py-1.5 text-xs flex items-center justify-center gap-2">
            <WifiOff className="h-3.5 w-3.5" />
            <span>Bạn đang ngoại tuyến (Offline). Dữ liệu nhạy cảm chỉ đồng bộ khi có Internet.</span>
          </div>
        )}

        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <form onSubmit={handleSearchSubmit} className="relative w-full max-w-md hidden sm:block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Tìm nhanh mã hồ sơ, tên khách hàng, MST..."
                className="pl-9 bg-slate-50 border-slate-200 focus:bg-white"
              />
            </form>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="h-8 w-8 rounded-full bg-blue-100 text-primary font-semibold text-xs flex items-center justify-center">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-800 leading-tight">{profile?.full_name}</div>
                <div className="text-[10px] text-slate-500 leading-tight">
                  {profile?.role ? ROLE_SHORT_LABELS[profile.role] : ''}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav (4 lối tắt chính + Menu) */}
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 lg:hidden grid grid-cols-5 h-14 pb-[env(safe-area-inset-bottom)]">
          {[
            { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
            { to: '/customers', label: 'Khách hàng', icon: Users },
            { to: '/cases', label: 'Hồ sơ', icon: Briefcase },
            { to: '/kanban', label: 'Kanban', icon: FolderKanban }
          ].map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
                    isActive ? 'text-primary' : 'text-slate-500'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-slate-500"
          >
            <Menu className="h-4 w-4" />
            <span>Thêm</span>
          </button>
        </nav>
      </div>

      {/* Dialog Đổi mật khẩu */}
      <Dialog open={pwdDialogOpen} onOpenChange={setPwdDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Đổi mật khẩu</DialogTitle>
            <DialogDescription>Nhập mật khẩu mới cho tài khoản của bạn (tối thiểu 6 ký tự).</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">Mật khẩu mới</Label>
              <Input
                id="new-pwd"
                type="password"
                minLength={6}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwdDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={savingPwd}>
                {savingPwd ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
