import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Settings2, Building2, History, GitBranch, FileSpreadsheet } from 'lucide-react'
import { GoogleSheetsSyncTab } from './GoogleSheetsSyncTab'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import { formatCurrency, formatDateTime } from '@/lib/formatters'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
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
import type {
  AppRole,
  AuditLog,
  Department,
  ServiceCategory,
  ServiceItem,
  WorkflowTemplate,
  WorkflowTemplateStep
} from '@/types/database'

export function SettingsPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = Permissions.canManageCatalog(profile?.role)
  const canConfigWorkflow = Permissions.canConfigureWorkflow(profile?.role)
  const canViewAudit = Permissions.canViewAuditLogs(profile?.role)
  const canSyncSheets = Permissions.canViewFinance(profile?.role)

  const [deptForm, setDeptForm] = useState({ code: '', name: '', description: '' })
  const [svcOpen, setSvcOpen] = useState(false)
  const [svcForm, setSvcForm] = useState({
    category_id: '',
    code: '',
    name: '',
    default_price: '1500000',
    default_duration_days: '7'
  })
  const [selectedServiceId, setSelectedServiceId] = useState<string>('')
  const [newStepTitle, setNewStepTitle] = useState('')
  const [newStepHours, setNewStepHours] = useState('24')
  const [newStepRole, setNewStepRole] = useState<AppRole>('staff')

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('*').order('code')
      if (error) throw error
      return data as Department[]
    }
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('service_categories').select('*').order('sort_order')
      if (error) throw error
      return data as ServiceCategory[]
    }
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*, category:service_categories(*)')
        .order('code')
      if (error) throw error
      return data as ServiceItem[]
    }
  })

  const { data: workflowTemplate } = useQuery({
    queryKey: ['workflow-template', selectedServiceId],
    enabled: Boolean(selectedServiceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_templates')
        .select('*')
        .eq('service_id', selectedServiceId)
        .maybeSingle()
      if (error) throw error
      return data as WorkflowTemplate | null
    }
  })

  const { data: templateSteps = [] } = useQuery({
    queryKey: ['workflow-template-steps', workflowTemplate?.id],
    enabled: Boolean(workflowTemplate?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_template_steps')
        .select('*')
        .eq('template_id', workflowTemplate!.id)
        .order('step_order')
      if (error) throw error
      return data as WorkflowTemplateStep[]
    }
  })

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['audit-logs'],
    enabled: canViewAudit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*, actor:profiles(id, full_name, email)')
        .order('created_at', { ascending: false })
        .limit(80)
      if (error) throw error
      return data as AuditLog[]
    }
  })

  const addDeptMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('departments').insert({
        code: deptForm.code.trim().toUpperCase(),
        name: deptForm.name.trim(),
        description: deptForm.description.trim() || null
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã thêm phòng ban')
      setDeptForm({ code: '', name: '', description: '' })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const addServiceMutation = useMutation({
    mutationFn: async () => {
      const { data: svc, error } = await supabase
        .from('services')
        .insert({
          category_id: svcForm.category_id,
          code: svcForm.code.trim().toUpperCase(),
          name: svcForm.name.trim(),
          default_price: Number(svcForm.default_price) || 0,
          default_duration_days: Number(svcForm.default_duration_days) || 7
        })
        .select()
        .single()
      if (error) throw error
      // Tự tạo template quy trình trống để cấu hình ngay
      await supabase.from('workflow_templates').insert({
        service_id: svc.id,
        name: `Quy trình - ${svc.name}`
      })
    },
    onSuccess: () => {
      toast.success('Đã thêm dịch vụ mới')
      setSvcOpen(false)
      setSvcForm({ category_id: '', code: '', name: '', default_price: '1500000', default_duration_days: '7' })
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const addTemplateStepMutation = useMutation({
    mutationFn: async () => {
      if (!selectedServiceId) return
      let tplId = workflowTemplate?.id
      if (!tplId) {
        const svc = services.find((s) => s.id === selectedServiceId)
        const { data: created, error: tplErr } = await supabase
          .from('workflow_templates')
          .insert({ service_id: selectedServiceId, name: `Quy trình - ${svc?.name || ''}` })
          .select()
          .single()
        if (tplErr) throw tplErr
        tplId = created.id
      }
      const nextOrder = templateSteps.length > 0 ? Math.max(...templateSteps.map((s) => s.step_order)) + 1 : 1
      const { error } = await supabase.from('workflow_template_steps').insert({
        template_id: tplId,
        step_order: nextOrder,
        title: newStepTitle.trim(),
        default_duration_hours: Number(newStepHours) || 24,
        default_role: newStepRole
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã thêm bước vào quy trình mẫu')
      setNewStepTitle('')
      queryClient.invalidateQueries({ queryKey: ['workflow-template', selectedServiceId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-template-steps'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const deleteTemplateStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase.from('workflow_template_steps').delete().eq('id', stepId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã xóa bước khỏi quy trình mẫu')
      queryClient.invalidateQueries({ queryKey: ['workflow-template-steps'] })
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cài đặt &amp; Cấu hình hệ thống</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Cấu hình danh mục dịch vụ, quy trình xử lý chuẩn theo từng dịch vụ, phòng ban và nhật ký hệ thống.
        </p>
      </div>

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">
            <Settings2 className="h-4 w-4 mr-1.5" />
            Danh mục Dịch vụ
          </TabsTrigger>
          <TabsTrigger value="workflows">
            <GitBranch className="h-4 w-4 mr-1.5" />
            Cấu hình Quy trình
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Building2 className="h-4 w-4 mr-1.5" />
            Phòng ban
          </TabsTrigger>
          {canViewAudit && (
            <TabsTrigger value="audit">
              <History className="h-4 w-4 mr-1.5" />
              Nhật ký Audit Log
            </TabsTrigger>
          )}
          {canSyncSheets && (
            <TabsTrigger value="gsheets">
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Đồng bộ Google Sheets
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-800">Danh mục dịch vụ ({services.length})</h2>
            {isAdmin && (
              <Button size="sm" onClick={() => setSvcOpen(true)}>
                <Plus className="h-4 w-4" />
                Thêm dịch vụ
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((cat) => {
              const items = services.filter((s) => s.category_id === cat.id)
              return (
                <Card key={cat.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-primary">{cat.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="divide-y divide-slate-100">
                    {items.map((svc) => (
                      <div key={svc.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{svc.name}</div>
                          <div className="text-xs text-slate-500">
                            Mã: {svc.code} • SLA chuẩn: {svc.default_duration_days} ngày
                          </div>
                        </div>
                        <Badge variant="secondary">{formatCurrency(svc.default_price)}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="workflows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Chọn dịch vụ để cấu hình quy trình xử lý</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Chọn loại dịch vụ..." />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedServiceId && (
                <div className="space-y-3">
                  <div className="divide-y divide-slate-100 border rounded-lg">
                    {templateSteps.length === 0 ? (
                      <div className="p-4 text-xs text-slate-400 text-center">Chưa có bước quy trình</div>
                    ) : (
                      templateSteps.map((step) => (
                        <div key={step.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-primary">
                              {step.step_order}
                            </span>
                            <div>
                              <div className="text-sm font-medium text-slate-900">{step.title}</div>
                              <div className="text-xs text-slate-500">
                                Thời hạn mặc định: {step.default_duration_hours} giờ • Vai trò: {step.default_role}
                              </div>
                            </div>
                          </div>
                          {canConfigWorkflow && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteTemplateStepMutation.mutate(step.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {canConfigWorkflow && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        addTemplateStepMutation.mutate()
                      }}
                      className="flex flex-col sm:flex-row gap-2 pt-2"
                    >
                      <Input
                        required
                        placeholder="Tên bước mới (VD: Kiểm tra hồ sơ nội bộ)"
                        value={newStepTitle}
                        onChange={(e) => setNewStepTitle(e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={newStepHours}
                        onChange={(e) => setNewStepHours(e.target.value)}
                        className="w-28"
                        placeholder="Giờ SLA"
                      />
                      <Select value={newStepRole} onValueChange={(v) => setNewStepRole(v as AppRole)}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="accountant">Accountant</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="submit" disabled={addTemplateStepMutation.isPending}>
                        <Plus className="h-4 w-4" />
                        Thêm bước
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Danh sách phòng ban</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100">
                {departments.map((d) => (
                  <div key={d.id} className="py-2.5">
                    <div className="text-sm font-semibold text-slate-900">
                      {d.name} <span className="text-xs font-normal text-slate-400">({d.code})</span>
                    </div>
                    {d.description && <div className="text-xs text-slate-500">{d.description}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Thêm phòng ban mới</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      addDeptMutation.mutate()
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <Label>Mã phòng ban</Label>
                      <Input
                        required
                        placeholder="VD: TU-VAN"
                        value={deptForm.code}
                        onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Tên phòng ban</Label>
                      <Input
                        required
                        placeholder="VD: Phòng Tư vấn Khách hàng"
                        value={deptForm.name}
                        onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Mô tả</Label>
                      <Input
                        value={deptForm.description}
                        onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                      />
                    </div>
                    <Button type="submit" disabled={addDeptMutation.isPending}>
                      Lưu phòng ban
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {canViewAudit && (
          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Lịch sử thao tác hệ thống (80 bản ghi gần nhất)</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Thời gian</th>
                      <th className="px-4 py-2.5">Người thực hiện</th>
                      <th className="px-4 py-2.5">Hành động</th>
                      <th className="px-4 py-2.5">Bảng dữ liệu</th>
                      <th className="px-4 py-2.5">ID đối tượng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">
                          {log.actor?.full_name || 'Hệ thống'}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline">{log.action}</Badge>
                        </td>
                        <td className="px-4 py-2 font-mono text-slate-600">{log.entity_table}</td>
                        <td className="px-4 py-2 font-mono text-slate-400">{log.entity_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canSyncSheets && (
          <TabsContent value="gsheets">
            <GoogleSheetsSyncTab />
          </TabsContent>
        )}
      </Tabs>

      {/* Dialog Thêm dịch vụ */}
      <Dialog open={svcOpen} onOpenChange={setSvcOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm dịch vụ kế toán / pháp lý</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addServiceMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Nhóm dịch vụ *</Label>
              <Select
                value={svcForm.category_id}
                onValueChange={(v) => setSvcForm({ ...svcForm, category_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm A / B / C / D" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mã dịch vụ *</Label>
                <Input
                  required
                  placeholder="VD: KH-BHXH"
                  value={svcForm.code}
                  onChange={(e) => setSvcForm({ ...svcForm, code: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Thời gian chuẩn (ngày)</Label>
                <Input
                  type="number"
                  min={1}
                  value={svcForm.default_duration_days}
                  onChange={(e) => setSvcForm({ ...svcForm, default_duration_days: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Tên dịch vụ *</Label>
              <Input
                required
                placeholder="VD: Đăng ký Bảo hiểm xã hội lần đầu"
                value={svcForm.name}
                onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Đơn giá tham chiếu (VNĐ)</Label>
              <Input
                type="number"
                min={0}
                value={svcForm.default_price}
                onChange={(e) => setSvcForm({ ...svcForm, default_price: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSvcOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={addServiceMutation.isPending}>
                Lưu dịch vụ
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
