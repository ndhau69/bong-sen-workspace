import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Eye, Pencil, Trash2, Building, Phone, Mail, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { ImportCustomersDialog } from './ImportCustomersDialog'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import { BUSINESS_TYPE_LABELS, formatDate } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
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
import type { BusinessType, Customer, Profile } from '@/types/database'

const PAGE_SIZE = 10

const EMPTY_FORM = {
  company_name: '',
  tax_code: '',
  business_type: 'tnhh_1tv' as BusinessType,
  legal_representative: '',
  phone: '',
  email: '',
  headquarters_address: '',
  business_lines: '',
  established_date: '',
  assigned_staff_id: '',
  notes: ''
}

export function CustomersPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canCreate = Permissions.canCreateCaseOrCustomer(profile?.role)
  const isAdmin = profile?.role === 'admin'

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [staffFilter, setStaffFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

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

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, assigned_staff:profiles!customers_assigned_staff_id_fkey(id, full_name, employee_code)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Customer[]
    }
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      if (typeFilter !== 'all' && c.business_type !== typeFilter) return false
      if (staffFilter !== 'all' && c.assigned_staff_id !== staffFilter) return false
      if (!q) return true
      return (
        c.company_name.toLowerCase().includes(q) ||
        c.customer_code.toLowerCase().includes(q) ||
        (c.tax_code || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.legal_representative || '').toLowerCase().includes(q)
      )
    })
  }, [customers, search, typeFilter, staffFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_name: form.company_name.trim(),
        tax_code: form.tax_code.trim() || null,
        business_type: form.business_type,
        legal_representative: form.legal_representative.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        headquarters_address: form.headquarters_address.trim() || null,
        business_lines: form.business_lines.trim() || null,
        established_date: form.established_date || null,
        assigned_staff_id: form.assigned_staff_id || profile?.id || null,
        notes: form.notes.trim() || null
      }

      if (editingId) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('customers')
          .insert({ ...payload, customer_code: '', created_by: profile?.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Đã cập nhật khách hàng' : 'Đã thêm khách hàng mới')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setDialogOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: async (cust: Customer) => {
      const { error } = await supabase
        .from('customers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', cust.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã lưu trữ (xóa mềm) khách hàng')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setDeleteTarget(null)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, assigned_staff_id: profile?.id || '' })
    setDialogOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditingId(c.id)
    setForm({
      company_name: c.company_name,
      tax_code: c.tax_code || '',
      business_type: c.business_type,
      legal_representative: c.legal_representative || '',
      phone: c.phone || '',
      email: c.email || '',
      headquarters_address: c.headquarters_address || '',
      business_lines: c.business_lines || '',
      established_date: c.established_date || '',
      assigned_staff_id: c.assigned_staff_id || '',
      notes: c.notes || ''
    })
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản lý Khách hàng (CRM)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Lưu trữ hồ sơ pháp nhân doanh nghiệp, hộ kinh doanh, lịch sử dịch vụ và chứng từ đính kèm.
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" />
              Import Excel / Sheet
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Thêm khách hàng
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm theo tên doanh nghiệp, mã KH, mã số thuế, SĐT..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full md:w-56">
              <SelectValue placeholder="Loại hình DN" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại hình</SelectItem>
              {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((bt) => (
                <SelectItem key={bt} value={bt}>
                  {BUSINESS_TYPE_LABELS[bt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={staffFilter}
            onValueChange={(v) => {
              setStaffFilter(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-full md:w-52">
              <SelectValue placeholder="Phụ trách" />
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

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Danh sách khách hàng ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-y border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Mã / Doanh nghiệp</th>
                <th className="px-4 py-3">MST &amp; Loại hình</th>
                <th className="px-4 py-3">Đại diện &amp; Liên hệ</th>
                <th className="px-4 py-3">Nhân viên phụ trách</th>
                <th className="px-4 py-3">Ngày thành lập</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                    Đang tải dữ liệu khách hàng...
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                    Không tìm thấy khách hàng nào
                  </td>
                </tr>
              ) : (
                paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className="text-left group"
                      >
                        <div className="font-semibold text-slate-900 group-hover:text-primary flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{c.company_name}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{c.customer_code}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-semibold text-slate-800">
                        {c.tax_code || 'Chưa có MST'}
                      </div>
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {BUSINESS_TYPE_LABELS[c.business_type]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium text-slate-800">{c.legal_representative || '—'}</div>
                      <div className="text-slate-500 flex items-center gap-2 mt-0.5">
                        {c.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {c.assigned_staff?.full_name || 'Chưa phân công'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{formatDate(c.established_date)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Xem chi tiết 360°"
                          onClick={() => navigate(`/customers/${c.id}`)}
                        >
                          <Eye className="h-4 w-4 text-slate-600" />
                        </Button>
                        {canCreate && (
                          <Button size="icon" variant="ghost" title="Chỉnh sửa" onClick={() => openEdit(c)}>
                            <Pencil className="h-4 w-4 text-slate-600" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Xóa khách hàng"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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

      {/* Dialog Thêm / Sửa khách hàng */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Cập nhật thông tin khách hàng' : 'Thêm khách hàng mới'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Tên doanh nghiệp / Hộ kinh doanh *</Label>
                <Input
                  required
                  placeholder="VD: Công ty TNHH Thương Mại Hải Vân Xanh"
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Mã số thuế</Label>
                <Input
                  placeholder="040xxxxxxx"
                  value={form.tax_code}
                  onChange={(e) => setForm({ ...form, tax_code: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Loại hình doanh nghiệp</Label>
                <Select
                  value={form.business_type}
                  onValueChange={(v) => setForm({ ...form, business_type: v as BusinessType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((bt) => (
                      <SelectItem key={bt} value={bt}>
                        {BUSINESS_TYPE_LABELS[bt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Người đại diện pháp luật</Label>
                <Input
                  value={form.legal_representative}
                  onChange={(e) => setForm({ ...form, legal_representative: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Số điện thoại</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày thành lập</Label>
                <Input
                  type="date"
                  value={form.established_date}
                  onChange={(e) => setForm({ ...form, established_date: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Địa chỉ trụ sở</Label>
                <Input
                  value={form.headquarters_address}
                  onChange={(e) => setForm({ ...form, headquarters_address: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngành nghề kinh doanh chính</Label>
                <Input
                  value={form.business_lines}
                  onChange={(e) => setForm({ ...form, business_lines: e.target.value })}
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
              <div className="space-y-1 sm:col-span-2">
                <Label>Ghi chú</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Đang lưu...' : editingId ? 'Lưu cập nhật' : 'Tạo khách hàng'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Xác nhận xóa khách hàng"
        description={`Bạn có chắc muốn lưu trữ khách hàng "${deleteTarget?.company_name}"? Dữ liệu hồ sơ liên quan vẫn được bảo toàn.`}
        confirmText="Xác nhận xóa"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
      />

      <ImportCustomersDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
