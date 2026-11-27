import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Eye, Trash2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import {
  KANBAN_COLUMNS,
  formatCurrency,
  formatDate,
  isOverdue
} from '@/lib/formatters'
import { KanbanStatusBadge, PriorityBadge } from '@/components/common/StatusBadge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  CasePriority,
  Customer,
  Profile,
  ServiceCase,
  ServiceItem
} from '@/types/database'

const PAGE_SIZE = 10

export function CasesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const canCreate = Permissions.canCreateCaseOrCustomer(profile?.role)
  const canViewFinance = Permissions.canViewFinance(profile?.role)
  const isAdmin = profile?.role === 'admin'

  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [staffFilter, setStaffFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ServiceCase | null>(null)

  const [form, setForm] = useState({
    customer_id: '',
    service_id: '',
    procedure_name: '',
    received_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    assigned_staff_id: '',
    priority: 'medium' as CasePriority,
    contract_value: '',
    notes: ''
  })

  useEffect(() => {
    const newForCustomer = searchParams.get('newForCustomer')
    if (newForCustomer) {
      setForm((prev) => ({ ...prev, customer_id: newForCustomer }))
      setCreateOpen(true)
      searchParams.delete('newForCustomer')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_code, company_name, tax_code')
        .is('deleted_at', null)
        .order('company_name')
      if (error) throw error
      return data as Pick<Customer, 'id' | 'customer_code' | 'company_name' | 'tax_code'>[]
    }
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, code, name, default_price, default_duration_days')
        .eq('is_active', true)
        .order('code')
      if (error) throw error
      return data as ServiceItem[]
    }
  })

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .eq('is_active', true)
        .order('full_name')
      if (error) throw error
      return data as Pick<Profile, 'id' | 'full_name' | 'employee_code'>[]
    }
  })

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['service-cases', canViewFinance],
    queryFn: async () => {
      const selectClause = canViewFinance
        ? '*, customer:customers(id, customer_code, company_name, tax_code, phone), service:services(id, code, name, category_id), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(id, full_name, employee_code), case_financials(*)'
        : '*, customer:customers(id, customer_code, company_name, tax_code, phone), service:services(id, code, name, category_id), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(id, full_name, employee_code)'
      const { data, error } = await supabase
        .from('service_cases')
        .select(selectClause)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ServiceCase[]
    }
  })

  const handleSelectService = (svcId: string) => {
    const svc = services.find((s) => s.id === svcId)
    if (!svc) return
    const received = new Date(form.received_date || Date.now())
    received.setDate(received.getDate() + (svc.default_duration_days || 7))
    setForm((prev) => ({
      ...prev,
      service_id: svcId,
      procedure_name: prev.procedure_name || svc.name,
      due_date: received.toISOString().slice(0, 10),
      contract_value: String(svc.default_price || 0)
    }))
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: created, error } = await supabase
        .from('service_cases')
        .insert({
          case_code: '',
          customer_id: form.customer_id,
          service_id: form.service_id,
          procedure_name: form.procedure_name.trim(),
          received_date: form.received_date,
          due_date: form.due_date || null,
          assigned_staff_id: form.assigned_staff_id || profile?.id || null,
          priority: form.priority,
          notes: form.notes.trim() || null,
          created_by: profile?.id
        })
        .select()
        .single()
      if (error) throw error

      if (canViewFinance && form.contract_value !== '' && created) {
        await supabase
          .from('case_financials')
          .update({ contract_value: Number(form.contract_value) || 0 })
          .eq('case_id', created.id)
      }
      return created
    },
    onSuccess: (created) => {
      toast.success(`Đã tạo hồ sơ ${created.case_code} & tự động khởi tạo quy trình xử lý`)
      queryClient.invalidateQueries({ queryKey: ['service-cases'] })
      setCreateOpen(false)
      setForm({
        customer_id: '',
        service_id: '',
        procedure_name: '',
        received_date: new Date().toISOString().slice(0, 10),
        due_date: '',
        assigned_staff_id: '',
        priority: 'medium',
        contract_value: '',
        notes: ''
      })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const deleteMutation = useMutation({
    mutationFn: async (c: ServiceCase) => {
      if (c.kanban_status === 'completed') {
        throw new Error('Không được phép xóa hồ sơ đã hoàn thành!')
      }
      const { error } = await supabase.from('service_cases').delete().eq('id', c.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã xóa hồ sơ')
      queryClient.invalidateQueries({ queryKey: ['service-cases'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases.filter((c) => {
      if (statusFilter !== 'all' && c.kanban_status !== statusFilter) return false
      if (serviceFilter !== 'all' && c.service_id !== serviceFilter) return false
      if (staffFilter !== 'all' && c.assigned_staff_id !== staffFilter) return false
      if (!q) return true
      return (
        c.case_code.toLowerCase().includes(q) ||
        c.procedure_name.toLowerCase().includes(q) ||
        (c.customer?.company_name || '').toLowerCase().includes(q) ||
        (c.customer?.tax_code || '').toLowerCase().includes(q)
      )
    })
  }, [cases, search, statusFilter, serviceFilter, staffFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản lý Hồ sơ dịch vụ</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi toàn bộ hồ sơ thủ tục, thời hạn xử lý, quy trình từng bước và công nợ.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Tiếp nhận hồ sơ mới
          </Button>
        )}
      </div>

      {/* Bộ lọc */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm mã hồ sơ, tên KH, MST..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger>
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              {KANBAN_COLUMNS.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={(v) => { setServiceFilter(v); setPage(1) }}>
            <SelectTrigger>
              <SelectValue placeholder="Loại dịch vụ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả dịch vụ</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={staffFilter} onValueChange={(v) => { setStaffFilter(v); setPage(1) }}>
            <SelectTrigger>
              <SelectValue placeholder="Nhân viên" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhân viên</SelectItem>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Bảng hồ sơ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Danh sách hồ sơ ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-y border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Mã / Thủ tục</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Phụ trách</th>
                <th className="px-4 py-3">Deadline</th>
                <th className="px-4 py-3">Ưu tiên</th>
                <th className="px-4 py-3">Trạng thái</th>
                {canViewFinance && <th className="px-4 py-3 text-right">Hợp đồng / Công nợ</th>}
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={canViewFinance ? 8 : 7} className="px-4 py-8 text-center text-xs text-slate-400">
                    Đang tải danh sách hồ sơ...
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={canViewFinance ? 8 : 7} className="px-4 py-8 text-center text-xs text-slate-400">
                    Không có hồ sơ phù hợp
                  </td>
                </tr>
              ) : (
                paginated.map((c) => {
                  const overdue = isOverdue(c.due_date, c.kanban_status)
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/cases/${c.id}`)}
                          className="text-left group"
                        >
                          <div className="font-semibold text-primary group-hover:underline">{c.case_code}</div>
                          <div className="text-xs font-medium text-slate-900 mt-0.5">{c.procedure_name}</div>
                          <div className="text-[11px] text-slate-400">{c.service?.name}</div>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-medium text-slate-900">{c.customer?.company_name}</div>
                        <div className="text-slate-500">MST: {c.customer?.tax_code || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {c.assigned_staff?.full_name || 'Chưa phân công'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className={overdue ? 'text-red-600 font-semibold flex items-center gap-1' : 'text-slate-600'}>
                          {overdue && <AlertCircle className="h-3.5 w-3.5" />}
                          {formatDate(c.due_date)}
                        </div>
                        <div className="text-[11px] text-slate-400">Nhận: {formatDate(c.received_date)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={c.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <KanbanStatusBadge status={c.kanban_status} />
                      </td>
                      {canViewFinance && (
                        <td className="px-4 py-3 text-right text-xs">
                          <div className="font-semibold text-slate-900">
                            {formatCurrency(c.case_financials?.contract_value)}
                          </div>
                          <div
                            className={
                              (c.case_financials?.remaining_debt || 0) > 0
                                ? 'text-amber-600 font-medium'
                                : 'text-emerald-600'
                            }
                          >
                            Nợ: {formatCurrency(c.case_financials?.remaining_debt)}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Mở chi tiết & quy trình"
                            onClick={() => navigate(`/cases/${c.id}`)}
                          >
                            <Eye className="h-4 w-4 text-slate-600" />
                          </Button>
                          {isAdmin && c.kanban_status !== 'completed' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Xóa hồ sơ"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
              <span>
                Trang {page} / {totalPages}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Tiếp nhận hồ sơ mới */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tiếp nhận hồ sơ dịch vụ mới</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Khách hàng *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn doanh nghiệp / hộ kinh doanh" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.customer_code} — {c.company_name} {c.tax_code ? `(${c.tax_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label>Loại dịch vụ *</Label>
                <Select value={form.service_id} onValueChange={handleSelectService}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn dịch vụ theo danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label>Tên thủ tục cụ thể *</Label>
                <Input
                  required
                  placeholder="VD: Thành lập Công ty TNHH 1TV An Phát"
                  value={form.procedure_name}
                  onChange={(e) => setForm({ ...form, procedure_name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Ngày tiếp nhận *</Label>
                <Input
                  type="date"
                  required
                  value={form.received_date}
                  onChange={(e) => setForm({ ...form, received_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày dự kiến hoàn thành</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Nhân viên phụ trách</Label>
                <Select
                  value={form.assigned_staff_id}
                  onValueChange={(v) => setForm({ ...form, assigned_staff_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhân viên" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Mức độ ưu tiên</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as CasePriority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Thấp</SelectItem>
                    <SelectItem value="medium">Trung bình</SelectItem>
                    <SelectItem value="high">Cao</SelectItem>
                    <SelectItem value="urgent">Khẩn cấp</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {canViewFinance && (
                <div className="space-y-1 sm:col-span-2">
                  <Label>Giá trị hợp đồng (VNĐ)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.contract_value}
                    onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-1 sm:col-span-2">
                <Label>Ghi chú tiếp nhận</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !form.customer_id || !form.service_id}>
                {createMutation.isPending ? 'Đang khởi tạo...' : 'Tạo hồ sơ & Quy trình'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Xóa hồ sơ dịch vụ"
        description={`Bạn có chắc muốn xóa hồ sơ ${deleteTarget?.case_code}? Thao tác này sẽ ghi vào Audit Log.`}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />
    </div>
  )
}
