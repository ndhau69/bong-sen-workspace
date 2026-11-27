import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus,
  Search,
  Shield,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  KeyRound,
  Eye
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import { ROLE_LABELS, ROLE_SHORT_LABELS, formatDate, isOverdue } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import type { AppRole, CaseStep, Department, Profile, ServiceCase } from '@/types/database'

export function EmployeesPage() {
  const { profile: currentProfile } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = Permissions.canManageEmployees(currentProfile?.role)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [deptFilter, setDeptFilter] = useState<string>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Profile | null>(null)
  const [detailEmployee, setDetailEmployee] = useState<Profile | null>(null)
  const [resetPwdTarget, setResetPwdTarget] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')

  // Form state tạo nhân viên
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'staff' as AppRole,
    department_id: '',
    job_title: ''
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('*').order('name')
      if (error) throw error
      return data as Department[]
    }
  })

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, department:departments(*)')
        .order('employee_code', { ascending: true })
      if (error) throw error
      return data as Profile[]
    }
  })

  const { data: cases = [] } = useQuery({
    queryKey: ['cases-for-employee-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cases')
        .select('id, case_code, procedure_name, assigned_staff_id, kanban_status, due_date, completed_at')
      if (error) throw error
      return data as Pick<
        ServiceCase,
        'id' | 'case_code' | 'procedure_name' | 'assigned_staff_id' | 'kanban_status' | 'due_date' | 'completed_at'
      >[]
    }
  })

  const { data: steps = [] } = useQuery({
    queryKey: ['steps-for-employee-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_steps')
        .select('id, case_id, assignee_id, status, due_date, completed_at')
      if (error) throw error
      return data as Pick<CaseStep, 'id' | 'case_id' | 'assignee_id' | 'status' | 'due_date' | 'completed_at'>[]
    }
  })

  const metricsByEmployee = useMemo(() => {
    const map = new Map<
      string,
      { activeCases: number; completedCases: number; overdueCases: number; completedSteps: number; overdueSteps: number }
    >()
    for (const emp of employees) {
      const empCases = cases.filter((c) => c.assigned_staff_id === emp.id)
      const empSteps = steps.filter((s) => s.assignee_id === emp.id)
      map.set(emp.id, {
        activeCases: empCases.filter((c) => c.kanban_status !== 'completed' && c.kanban_status !== 'cancelled').length,
        completedCases: empCases.filter((c) => c.kanban_status === 'completed').length,
        overdueCases: empCases.filter((c) => isOverdue(c.due_date, c.kanban_status)).length,
        completedSteps: empSteps.filter((s) => s.status === 'completed').length,
        overdueSteps: empSteps.filter((s) => isOverdue(s.due_date, s.status)).length
      })
    }
    return map
  }, [employees, cases, steps])

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (roleFilter !== 'all' && e.role !== roleFilter) return false
      if (deptFilter !== 'all' && e.department_id !== deptFilter) return false
      if (!q) return true
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.employee_code || '').toLowerCase().includes(q) ||
        (e.phone || '').includes(q)
      )
    })
  }, [employees, roleFilter, deptFilter, search])

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: {
          action: 'create',
          ...form,
          department_id: form.department_id || null
        }
      })
      if (error) throw new Error(error.message || 'Không thể tạo nhân viên (kiểm tra Edge Function manage-employee)')
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast.success('Đã tạo tài khoản nhân viên mới')
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setCreateOpen(false)
      setForm({ full_name: '', email: '', password: '', phone: '', role: 'staff', department_id: '', job_title: '' })
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const updateMutation = useMutation({
    mutationFn: async (payload: Profile) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: payload.full_name,
          phone: payload.phone,
          role: payload.role,
          department_id: payload.department_id,
          job_title: payload.job_title,
          is_active: payload.is_active
        })
        .eq('id', payload.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã cập nhật thông tin nhân viên')
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setEditingEmployee(null)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const resetPwdMutation = useMutation({
    mutationFn: async () => {
      if (!resetPwdTarget) return
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'reset_password', user_id: resetPwdTarget.id, new_password: newPassword }
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      toast.success('Đã đặt lại mật khẩu cho nhân viên')
      setResetPwdTarget(null)
      setNewPassword('')
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const detailCases = useMemo(() => {
    if (!detailEmployee) return []
    return cases.filter((c) => c.assigned_staff_id === detailEmployee.id)
  }, [cases, detailEmployee])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản lý Nhân viên &amp; Hiệu suất</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi phân công hồ sơ, hiệu suất xử lý và phân quyền tài khoản nhân sự.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Thêm nhân viên
          </Button>
        )}
      </div>

      {/* Bộ lọc */}
      <Card>
        <CardContent className="pt-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm theo tên, mã NV, email, số điện thoại..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Vai trò" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả vai trò</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="staff">Nhân viên</SelectItem>
              <SelectItem value="accountant">Kế toán</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-full md:w-56">
              <SelectValue placeholder="Phòng ban" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả phòng ban</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Bảng nhân viên */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Danh sách nhân sự ({filteredEmployees.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-y border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3">Phòng ban / Vị trí</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3 text-center">Đang phụ trách</th>
                <th className="px-4 py-3 text-center">Hoàn thành</th>
                <th className="px-4 py-3 text-center">Quá hạn</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">
                    Đang tải danh sách nhân viên...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-400">
                    Không có nhân viên phù hợp
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const m = metricsByEmployee.get(emp.id) || {
                    activeCases: 0,
                    completedCases: 0,
                    overdueCases: 0,
                    completedSteps: 0,
                    overdueSteps: 0
                  }
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{emp.full_name}</div>
                        <div className="text-xs text-slate-500">
                          {emp.employee_code} • {emp.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-slate-800">{emp.department?.name || '—'}</div>
                        <div className="text-xs text-slate-500">{emp.job_title || 'Chưa cập nhật'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={emp.role === 'admin' ? 'default' : 'secondary'}>
                          <Shield className="h-3 w-3 mr-1" />
                          {ROLE_SHORT_LABELS[emp.role]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-blue-700">{m.activeCases}</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-700">{m.completedCases}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={
                            m.overdueCases + m.overdueSteps > 0
                              ? 'font-semibold text-red-600'
                              : 'text-slate-400'
                          }
                        >
                          {m.overdueCases} HS / {m.overdueSteps} bước
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={emp.is_active ? 'success' : 'destructive'}>
                          {emp.is_active ? 'Đang làm việc' : 'Đã khóa'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Xem hiệu suất & hồ sơ"
                            onClick={() => setDetailEmployee(emp)}
                          >
                            <Eye className="h-4 w-4 text-slate-600" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Sửa thông tin / phân quyền"
                                onClick={() => setEditingEmployee({ ...emp })}
                              >
                                <Pencil className="h-4 w-4 text-slate-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Đặt lại mật khẩu"
                                onClick={() => setResetPwdTarget(emp)}
                              >
                                <KeyRound className="h-4 w-4 text-slate-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog Thêm nhân viên */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo tài khoản nhân viên mới</DialogTitle>
            <DialogDescription>
              Tài khoản được tạo an toàn qua Edge Function trên server với phân quyền RBAC.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Họ và tên *</Label>
                <Input
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Số điện thoại</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email đăng nhập *</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Mật khẩu khởi tạo *</Label>
                <Input
                  type="password"
                  minLength={6}
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Vai trò hệ thống</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['admin', 'manager', 'staff', 'accountant'] as AppRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Phòng ban</Label>
                <Select
                  value={form.department_id}
                  onValueChange={(v) => setForm({ ...form, department_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn phòng ban" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Chức danh / Vị trí</Label>
              <Input
                placeholder="VD: Chuyên viên pháp lý doanh nghiệp"
                value={form.job_title}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Đang tạo...' : 'Tạo nhân viên'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Sửa nhân viên */}
      <Dialog open={Boolean(editingEmployee)} onOpenChange={(o) => !o && setEditingEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cập nhật nhân viên: {editingEmployee?.full_name}</DialogTitle>
          </DialogHeader>
          {editingEmployee && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                updateMutation.mutate(editingEmployee)
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Họ và tên</Label>
                  <Input
                    required
                    value={editingEmployee.full_name}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Số điện thoại</Label>
                  <Input
                    value={editingEmployee.phone || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Vai trò</Label>
                  <Select
                    value={editingEmployee.role}
                    onValueChange={(v) => setEditingEmployee({ ...editingEmployee, role: v as AppRole })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['admin', 'manager', 'staff', 'accountant'] as AppRole[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Phòng ban</Label>
                  <Select
                    value={editingEmployee.department_id || ''}
                    onValueChange={(v) => setEditingEmployee({ ...editingEmployee, department_id: v || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn phòng ban" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Chức danh</Label>
                <Input
                  value={editingEmployee.job_title || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, job_title: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Trạng thái hoạt động</div>
                  <div className="text-[11px] text-slate-500">Tắt để khóa đăng nhập của nhân viên này</div>
                </div>
                <Switch
                  checked={editingEmployee.is_active}
                  onCheckedChange={(checked) => setEditingEmployee({ ...editingEmployee, is_active: checked })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingEmployee(null)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Đặt lại mật khẩu */}
      <Dialog open={Boolean(resetPwdTarget)} onOpenChange={(o) => !o && setResetPwdTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Đặt lại mật khẩu</DialogTitle>
            <DialogDescription>Nhân viên: {resetPwdTarget?.full_name}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              resetPwdMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Mật khẩu mới (tối thiểu 6 ký tự)</Label>
              <Input
                type="password"
                minLength={6}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetPwdTarget(null)}>
                Hủy
              </Button>
              <Button type="submit" disabled={resetPwdMutation.isPending}>
                Cập nhật
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Chi tiết hiệu suất nhân viên */}
      <Dialog open={Boolean(detailEmployee)} onOpenChange={(o) => !o && setDetailEmployee(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hiệu suất &amp; Hồ sơ phụ trách: {detailEmployee?.full_name}</DialogTitle>
            <DialogDescription>
              {detailEmployee?.employee_code} • {detailEmployee?.department?.name || 'Chưa phân phòng ban'}
            </DialogDescription>
          </DialogHeader>
          {detailEmployee && (
            <div className="space-y-4">
              {(() => {
                const m = metricsByEmployee.get(detailEmployee.id)
                const total = (m?.activeCases || 0) + (m?.completedCases || 0)
                const rate = total > 0 ? Math.round(((m?.completedCases || 0) / total) * 100) : 0
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-blue-50 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-blue-700 font-medium">
                        <Briefcase className="h-3.5 w-3.5" /> Đang xử lý
                      </div>
                      <div className="text-xl font-bold text-blue-900 mt-1">{m?.activeCases || 0}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Hoàn thành
                      </div>
                      <div className="text-xl font-bold text-emerald-900 mt-1">{m?.completedCases || 0}</div>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-red-700 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" /> Quá hạn
                      </div>
                      <div className="text-xl font-bold text-red-900 mt-1">{m?.overdueCases || 0}</div>
                    </div>
                    <div className="rounded-lg bg-slate-100 p-3">
                      <div className="text-xs text-slate-600 font-medium">Tỷ lệ hoàn tất</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{rate}%</div>
                    </div>
                  </div>
                )
              })()}

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Danh sách hồ sơ đang phụ trách ({detailCases.length})</div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border rounded-lg">
                  {detailCases.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">Chưa có hồ sơ được giao</div>
                  ) : (
                    detailCases.map((c) => (
                      <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-semibold text-slate-900">{c.case_code}</span> — {c.procedure_name}
                        </div>
                        <span className={isOverdue(c.due_date, c.kanban_status) ? 'text-red-600 font-medium' : 'text-slate-500'}>
                          Hạn: {formatDate(c.due_date)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
