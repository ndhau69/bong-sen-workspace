import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Pencil
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { ROLE_LABELS, ROLE_SHORT_LABELS, formatLoginDisplay, normalizeLoginIdentifier } from '@/lib/formatters'
import { APP_SCREENS, DEFAULT_ROLE_VISIBILITY, type ScreenKey } from './screenConfig'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { toast } from 'sonner'
import type { AppRole, Department, Profile } from '@/types/database'

const ROLES: AppRole[] = ['admin', 'manager', 'staff', 'accountant']

interface RolePermissionRow {
  role: AppRole
  screen_key: ScreenKey
  is_visible: boolean
}

interface UserPermissionRow {
  user_id: string
  screen_key: ScreenKey
  is_visible: boolean
}

export function UserAccessPage() {
  const { profile: currentProfile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState('users')
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const [createForm, setCreateForm] = useState({
    employee_code: '',
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

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, department:departments(*)')
        .order('employee_code', { ascending: true })
      if (error) throw error
      return data as Profile[]
    }
  })

  const { data: rolePerms = [] } = useQuery({
    queryKey: ['all-role-screen-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('role_screen_permissions').select('role, screen_key, is_visible')
      if (error) throw error
      return data as RolePermissionRow[]
    }
  })

  const { data: userPerms = [] } = useQuery({
    queryKey: ['all-user-screen-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_screen_permissions').select('user_id, screen_key, is_visible')
      if (error) throw error
      return data as UserPermissionRow[]
    }
  })

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const normalizedEmail = normalizeLoginIdentifier(createForm.email)
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: {
          action: 'create',
          employee_code: createForm.employee_code.trim() || null,
          full_name: createForm.full_name.trim(),
          email: normalizedEmail,
          password: createForm.password,
          phone: createForm.phone.trim() || null,
          role: createForm.role,
          department_id: createForm.department_id || null,
          job_title: createForm.job_title.trim() || null
        }
      })
      if (error) throw new Error(error.message || 'Không thể tạo user')
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast.success('Đã tạo tài khoản User mới thành công')
      queryClient.invalidateQueries({ queryKey: ['admin-users-list'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setCreateForm({
        employee_code: '',
        full_name: '',
        email: '',
        password: '',
        phone: '',
        role: 'staff',
        department_id: '',
        job_title: ''
      })
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const updateUserMutation = useMutation({
    mutationFn: async (payload: {
      id: string
      employee_code?: string | null
      full_name?: string
      phone?: string | null
      role?: AppRole
      is_active?: boolean
      department_id?: string | null
      job_title?: string | null
    }) => {
      const { id, ...updates } = payload
      const { error } = await supabase.from('profiles').update(updates).eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: async (updatedId) => {
      toast.success('Đã cập nhật thông tin User')
      queryClient.invalidateQueries({ queryKey: ['admin-users-list'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setEditingUser(null)
      if (updatedId === currentProfile?.id) {
        await refreshProfile()
      }
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const resetPwdMutation = useMutation({
    mutationFn: async () => {
      if (!resetTarget) return
      const { data, error } = await supabase.functions.invoke('manage-employee', {
        body: { action: 'reset_password', user_id: resetTarget.id, new_password: newPassword }
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      toast.success('Đã đặt lại mật khẩu thành công')
      setResetTarget(null)
      setNewPassword('')
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const toggleRoleScreenMutation = useMutation({
    mutationFn: async ({ role, screenKey, isVisible }: { role: AppRole; screenKey: ScreenKey; isVisible: boolean }) => {
      const { error } = await supabase.from('role_screen_permissions').upsert(
        {
          role,
          screen_key: screenKey,
          is_visible: isVisible,
          updated_by: currentProfile?.id || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'role,screen_key' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-role-screen-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['my-role-screen-permissions'] })
      toast.success('Đã cập nhật hiển thị màn hình theo vai trò')
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const resetRoleDefaultsMutation = useMutation({
    mutationFn: async () => {
      const rows: Array<{ role: AppRole; screen_key: ScreenKey; is_visible: boolean; updated_by: string | null }> = []
      for (const role of ROLES) {
        for (const screen of APP_SCREENS) {
          rows.push({
            role,
            screen_key: screen.key,
            is_visible: DEFAULT_ROLE_VISIBILITY[role][screen.key],
            updated_by: currentProfile?.id || null
          })
        }
      }
      const { error } = await supabase.from('role_screen_permissions').upsert(rows, { onConflict: 'role,screen_key' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-role-screen-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['my-role-screen-permissions'] })
      toast.success('Đã khôi phục cấu hình Show/Hide mặc định')
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const setUserOverrideMutation = useMutation({
    mutationFn: async ({
      userId,
      screenKey,
      mode
    }: {
      userId: string
      screenKey: ScreenKey
      mode: 'default' | 'show' | 'hide'
    }) => {
      if (mode === 'default') {
        const { error } = await supabase
          .from('user_screen_permissions')
          .delete()
          .eq('user_id', userId)
          .eq('screen_key', screenKey)
        if (error) throw error
      } else {
        const { error } = await supabase.from('user_screen_permissions').upsert(
          {
            user_id: userId,
            screen_key: screenKey,
            is_visible: mode === 'show',
            updated_by: currentProfile?.id || null,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,screen_key' }
        )
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-screen-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['my-user-screen-permissions'] })
      toast.success('Đã cập nhật phân quyền màn hình cho User')
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const roleMatrixMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const r of rolePerms) {
      map.set(`${r.role}:${r.screen_key}`, r.is_visible)
    }
    return map
  }, [rolePerms])

  const getRoleScreenVisible = (role: AppRole, key: ScreenKey): boolean => {
    const v = roleMatrixMap.get(`${role}:${key}`)
    return v !== undefined ? v : DEFAULT_ROLE_VISIBILITY[role][key]
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employee_code || '').toLowerCase().includes(q)
    )
  }, [users, search])

  const selectedUser = users.find((u) => u.id === selectedUserId) || null

  const getUserOverrideMode = (userId: string, key: ScreenKey): 'default' | 'show' | 'hide' => {
    const found = userPerms.find((p) => p.user_id === userId && p.screen_key === key)
    if (!found) return 'default'
    return found.is_visible ? 'show' : 'hide'
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Tạo User &amp; Phân quyền Màn hình</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Tạo tài khoản đăng nhập mới, cập nhật thông tin nhân sự, gán vai trò và cấu hình Show / Hide từng màn hình.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="users">
            <UserPlus className="h-4 w-4 mr-1.5" />
            Tạo &amp; Quản lý User ({users.length})
          </TabsTrigger>
          <TabsTrigger value="role-matrix">
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            Phân quyền theo Vai trò (Show / Hide)
          </TabsTrigger>
          <TabsTrigger value="user-override">
            <SlidersHorizontal className="h-4 w-4 mr-1.5" />
            Phân quyền riêng từng User
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TẠO & QUẢN LÝ USER */}
        <TabsContent value="users" className="space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  Tạo User mới
                </CardTitle>
                <CardDescription>Tài khoản được kích hoạt đăng nhập ngay lập tức.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    createUserMutation.mutate()
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Mã nhân viên</Label>
                      <Input
                        placeholder="Tự sinh (VD: NV-002)"
                        value={createForm.employee_code}
                        onChange={(e) => setCreateForm({ ...createForm, employee_code: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Họ và tên *</Label>
                      <Input
                        required
                        placeholder="VD: Trần Thị Minh Anh"
                        value={createForm.full_name}
                        onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Tên đăng nhập *</Label>
                    <Input
                      type="text"
                      required
                      placeholder="VD: minhanh hoặc minhanh@ketoanbongsen.vn"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Mật khẩu khởi tạo *</Label>
                    <Input
                      type="password"
                      minLength={6}
                      required
                      placeholder="Tối thiểu 6 ký tự"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Vai trò / Quyền</Label>
                      <Select
                        value={createForm.role}
                        onValueChange={(v) => setCreateForm({ ...createForm, role: v as AppRole })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_SHORT_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Số điện thoại</Label>
                      <Input
                        value={createForm.phone}
                        onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Phòng ban</Label>
                    <Select
                      value={createForm.department_id}
                      onValueChange={(v) => setCreateForm({ ...createForm, department_id: v })}
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
                  <div className="space-y-1">
                    <Label>Chức danh</Label>
                    <Input
                      placeholder="VD: Chuyên viên Kế toán Thuế"
                      value={createForm.job_title}
                      onChange={(e) => setCreateForm({ ...createForm, job_title: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>
                    <UserPlus className="h-4 w-4" />
                    {createUserMutation.isPending ? 'Đang tạo tài khoản...' : 'Tạo User ngay'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
                <CardTitle className="text-sm">Danh sách tài khoản ({filteredUsers.length})</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Tìm tên, tên đăng nhập, mã NV..."
                    className="pl-9 h-8 text-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">Mã Nhân viên</th>
                      <th className="px-4 py-3">Họ tên / Tên đăng nhập</th>
                      <th className="px-4 py-3">Vai trò</th>
                      <th className="px-4 py-3 text-center">Hoạt động</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingUsers ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                          Đang tải danh sách User...
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelf = u.id === currentProfile?.id
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3 font-mono font-semibold text-primary whitespace-nowrap">
                              {u.employee_code || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{u.full_name}</div>
                              <div className="text-slate-500">{formatLoginDisplay(u.email)}</div>
                              {u.department?.name && (
                                <div className="text-[11px] text-slate-400">{u.department.name}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                disabled={isSelf}
                                value={u.role}
                                onValueChange={(v) => updateUserMutation.mutate({ id: u.id, role: v as AppRole })}
                              >
                                <SelectTrigger className="h-8 w-32 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLES.map((r) => (
                                    <SelectItem key={r} value={r}>
                                      {ROLE_SHORT_LABELS[r]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Switch
                                disabled={isSelf}
                                checked={u.is_active}
                                onCheckedChange={(checked) =>
                                  updateUserMutation.mutate({ id: u.id, is_active: checked })
                                }
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1 whitespace-nowrap">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Chỉnh sửa thông tin User"
                                  onClick={() => setEditingUser({ ...u })}
                                >
                                  <Pencil className="h-4 w-4 text-slate-600" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setSelectedUserId(u.id)
                                    setActiveTab('user-override')
                                  }}
                                >
                                  <SlidersHorizontal className="h-3.5 w-3.5" /> Quyền màn hình
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Đặt lại mật khẩu"
                                  onClick={() => setResetTarget(u)}
                                >
                                  <KeyRound className="h-4 w-4 text-slate-600" />
                                </Button>
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
          </div>
        </TabsContent>

        {/* TAB 2: MA TRẬN SHOW / HIDE THEO VAI TRÒ */}
        <TabsContent value="role-matrix" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Ma trận phân quyền màn hình Show / Hide theo Vai trò</CardTitle>
                <CardDescription>
                  Bật hoặc tắt từng màn hình cho mỗi vai trò. Thay đổi có hiệu lực ngay lập tức trên Sidebar và chặn truy cập trực tiếp qua URL.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={resetRoleDefaultsMutation.isPending}
                onClick={() => resetRoleDefaultsMutation.mutate()}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Khôi phục mặc định
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Màn hình / Phân hệ</th>
                    {ROLES.map((r) => (
                      <th key={r} className="px-4 py-3 text-center">
                        {ROLE_SHORT_LABELS[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {APP_SCREENS.map((screen) => (
                    <tr key={screen.key} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{screen.label}</div>
                        <div className="text-slate-500">{screen.description}</div>
                      </td>
                      {ROLES.map((role) => {
                        const isVisible = getRoleScreenVisible(role, screen.key)
                        const locked = role === 'admin' && screen.key === 'user_access'
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-2">
                              <Switch
                                disabled={locked}
                                checked={isVisible}
                                onCheckedChange={(checked) =>
                                  toggleRoleScreenMutation.mutate({
                                    role,
                                    screenKey: screen.key,
                                    isVisible: checked
                                  })
                                }
                              />
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-medium w-12 ${
                                  isVisible ? 'text-emerald-700' : 'text-slate-400'
                                }`}
                              >
                                {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                {isVisible ? 'Show' : 'Hide'}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: PHÂN QUYỀN RIÊNG TỪNG USER */}
        <TabsContent value="user-override" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Phân quyền Show / Hide riêng cho từng User</CardTitle>
              <CardDescription>
                Ghi đè quyền mặc định theo vai trò đối với từng tài khoản cụ thể (ví dụ: cho phép 1 nhân viên cụ thể xem thêm màn hình Báo cáo hoặc ẩn bớt màn hình không dùng).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-md space-y-1.5">
                <Label>Chọn tài khoản User cần cấu hình</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhân viên / User..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.employee_code ? `${u.employee_code} — ` : ''}{u.full_name} ({ROLE_SHORT_LABELS[u.role]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser && (
                <div className="border rounded-xl overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3">Màn hình</th>
                        <th className="px-4 py-3">Mặc định ({ROLE_LABELS[selectedUser.role]})</th>
                        <th className="px-4 py-3">Thiết lập riêng cho User</th>
                        <th className="px-4 py-3 text-center">Kết quả hiệu lực</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {APP_SCREENS.map((screen) => {
                        const roleDefault = getRoleScreenVisible(selectedUser.role, screen.key)
                        const mode = getUserOverrideMode(selectedUser.id, screen.key)
                        const effective =
                          selectedUser.role === 'admin' && screen.key === 'user_access'
                            ? true
                            : mode === 'default'
                              ? roleDefault
                              : mode === 'show'
                        const locked = selectedUser.role === 'admin' && screen.key === 'user_access'

                        return (
                          <tr key={screen.key} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">{screen.label}</div>
                              <div className="text-slate-500">{screen.path}</div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={roleDefault ? 'success' : 'secondary'}>
                                {roleDefault ? 'Show' : 'Hide'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
                                {[
                                  { id: 'default' as const, label: 'Theo vai trò' },
                                  { id: 'show' as const, label: 'Luôn Show' },
                                  { id: 'hide' as const, label: 'Luôn Hide' }
                                ].map((opt) => (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    disabled={locked}
                                    onClick={() =>
                                      setUserOverrideMutation.mutate({
                                        userId: selectedUser.id,
                                        screenKey: screen.key,
                                        mode: opt.id
                                      })
                                    }
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                                      mode === opt.id
                                        ? opt.id === 'show'
                                          ? 'bg-emerald-600 text-white'
                                          : opt.id === 'hide'
                                            ? 'bg-slate-700 text-white'
                                            : 'bg-white text-primary shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                    } disabled:opacity-50`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={effective ? 'success' : 'destructive'}>
                                {effective ? 'Đang Show' : 'Đang Hide'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Chỉnh sửa thông tin User */}
      <Dialog open={Boolean(editingUser)} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa thông tin User</DialogTitle>
            <DialogDescription>Tên đăng nhập: {formatLoginDisplay(editingUser?.email)}</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                updateUserMutation.mutate({
                  id: editingUser.id,
                  employee_code: editingUser.employee_code?.trim() || null,
                  full_name: editingUser.full_name.trim(),
                  phone: editingUser.phone?.trim() || null,
                  department_id: editingUser.department_id,
                  job_title: editingUser.job_title?.trim() || null,
                  role: editingUser.role,
                  is_active: editingUser.is_active
                })
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Mã nhân viên</Label>
                  <Input
                    value={editingUser.employee_code || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, employee_code: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Họ và tên *</Label>
                  <Input
                    required
                    value={editingUser.full_name}
                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Số điện thoại</Label>
                  <Input
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Vai trò / Quyền</Label>
                  <Select
                    disabled={editingUser.id === currentProfile?.id}
                    value={editingUser.role}
                    onValueChange={(v) => setEditingUser({ ...editingUser, role: v as AppRole })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
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
                    value={editingUser.department_id || ''}
                    onValueChange={(v) => setEditingUser({ ...editingUser, department_id: v || null })}
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
                <div className="space-y-1">
                  <Label>Chức danh</Label>
                  <Input
                    value={editingUser.job_title || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, job_title: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Trạng thái hoạt động</div>
                  <div className="text-[11px] text-slate-500">Tắt để khóa đăng nhập tài khoản này</div>
                </div>
                <Switch
                  disabled={editingUser.id === currentProfile?.id}
                  checked={editingUser.is_active}
                  onCheckedChange={(checked) => setEditingUser({ ...editingUser, is_active: checked })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Đặt lại mật khẩu */}
      <Dialog open={Boolean(resetTarget)} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Đặt lại mật khẩu User</DialogTitle>
            <DialogDescription>
              {resetTarget?.full_name} ({resetTarget?.email})
            </DialogDescription>
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
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Hủy
              </Button>
              <Button type="submit" disabled={resetPwdMutation.isPending}>
                Cập nhật mật khẩu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
