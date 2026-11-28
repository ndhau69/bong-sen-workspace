import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Building,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Columns3,
  UserCog,
  Download,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { ImportCustomersDialog } from './ImportCustomersDialog'
import { CustomerPicManagerDialog } from './CustomerPicManagerDialog'
import { CustomerColumnsDialog } from './CustomerColumnsDialog'
import {
  DEFAULT_OPERATING_STATUSES,
  FALLBACK_COLUMNS,
  SYSTEM_COLUMN_KEYS,
  getCustomerDisplayValue,
  getCustomerRawValue,
  sortBySheetNo
} from './customerColumns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import { BUSINESS_TYPE_LABELS } from '@/lib/formatters'
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
import type {
  BusinessType,
  Customer,
  CustomerColumnConfig,
  CustomerPicOption,
  Profile
} from '@/types/database'

const EMPTY_SELECT = '__EMPTY__'

type SortMode = 'sheet_no' | 'updated_desc' | 'name_asc'

interface CustomerFormState {
  sheet_no: string
  company_name: string
  identity_number: string
  tax_code: string
  business_type: BusinessType
  pic_name: string
  operating_status: string
  legal_representative: string
  phone: string
  email: string
  headquarters_address: string
  business_lines: string
  established_date: string
  assigned_staff_id: string
  notes: string
  custom_fields: Record<string, string>
}

const EMPTY_FORM: CustomerFormState = {
  sheet_no: '',
  company_name: '',
  identity_number: '',
  tax_code: '',
  business_type: 'tnhh_1tv',
  pic_name: '',
  operating_status: 'Đang hoạt động',
  legal_representative: '',
  phone: '',
  email: '',
  headquarters_address: '',
  business_lines: '',
  established_date: '',
  assigned_staff_id: '',
  notes: '',
  custom_fields: {}
}

function getStatusBadgeClass(status: string | null | undefined): string {
  const s = (status || '').toLowerCase()
  if (s.includes('ngưng') || s.includes('ngừng')) {
    return 'bg-rose-50 text-rose-700 border-rose-200'
  }
  if (s.includes('tạm')) {
    return 'bg-amber-50 text-amber-700 border-amber-200'
  }
  if (s.includes('đang')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

export function CustomersPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canCreate = Permissions.canCreateCaseOrCustomer(profile?.role)
  const isAdmin = profile?.role === 'admin'
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  const [search, setSearch] = useState('')
  const [picFilter, setPicFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortMode, setSortMode] = useState<SortMode>('sheet_no')
  const [pageSize, setPageSize] = useState<number>(25)
  const [page, setPage] = useState(1)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [showHiddenInForm, setShowHiddenInForm] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [picManagerOpen, setPicManagerOpen] = useState(false)
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  const { data: columnConfigs = [] } = useQuery({
    queryKey: ['customer-column-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_column_configs')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data || []).map((row) => ({
        ...row,
        options: Array.isArray(row.options) ? row.options : []
      })) as CustomerColumnConfig[]
    }
  })

  const { data: picOptions = [] } = useQuery({
    queryKey: ['customer-pic-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_pic_options')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as CustomerPicOption[]
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

  const allColumns = columnConfigs.length > 0 ? columnConfigs : FALLBACK_COLUMNS
  const visibleColumns = useMemo(
    () => allColumns.filter((c) => c.is_visible),
    [allColumns]
  )
  const hiddenFormColumns = useMemo(
    () => allColumns.filter((c) => !c.is_visible && c.column_key !== 'customer_code'),
    [allColumns]
  )
  const visibleFormColumns = useMemo(
    () => allColumns.filter((c) => c.is_visible && c.column_key !== 'customer_code'),
    [allColumns]
  )

  const activePicOptions = useMemo(
    () => picOptions.filter((p) => p.is_active),
    [picOptions]
  )

  const picColorMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of picOptions) {
      m.set(p.name, p.color || '#2563eb')
    }
    return m
  }, [picOptions])

  const statusChoices = useMemo(() => {
    const statusCol = allColumns.find((c) => c.column_key === 'operating_status')
    const base =
      statusCol && statusCol.options.length > 0 ? statusCol.options : DEFAULT_OPERATING_STATUSES
    const extra = new Set(base)
    for (const c of customers) {
      if (c.operating_status) extra.add(c.operating_status)
    }
    return Array.from(extra)
  }, [allColumns, customers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = customers.filter((c) => {
      if (picFilter === '__UNASSIGNED__') {
        if (c.pic_name) return false
      } else if (picFilter !== 'all' && c.pic_name !== picFilter) {
        return false
      }

      if (statusFilter !== 'all' && (c.operating_status || '') !== statusFilter) {
        return false
      }

      if (!q) return true
      const customMatch = Object.values(c.custom_fields || {}).some((val) =>
        String(val || '').toLowerCase().includes(q)
      )
      return (
        (c.sheet_no || '').toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q) ||
        c.customer_code.toLowerCase().includes(q) ||
        (c.identity_number || '').toLowerCase().includes(q) ||
        (c.tax_code || '').toLowerCase().includes(q) ||
        (c.pic_name || '').toLowerCase().includes(q) ||
        (c.operating_status || '').toLowerCase().includes(q) ||
        (c.legal_representative || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.headquarters_address || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q) ||
        customMatch
      )
    })

    if (sortMode === 'sheet_no') {
      return [...list].sort(sortBySheetNo)
    }
    if (sortMode === 'name_asc') {
      return [...list].sort((a, b) => a.company_name.localeCompare(b.company_name, 'vi'))
    }
    return [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [customers, search, picFilter, statusFilter, sortMode])

  const effectivePageSize = pageSize === 0 ? Math.max(1, filtered.length) : pageSize
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * effectivePageSize, safePage * effectivePageSize)

  const canEditRow = (c: Customer) =>
    isAdminOrManager || (canCreate && c.assigned_staff_id === profile?.id)

  const quickUpdateMutation = useMutation({
    mutationFn: async ({
      customer,
      columnKey,
      value
    }: {
      customer: Customer
      columnKey: string
      value: string | null
    }) => {
      if (SYSTEM_COLUMN_KEYS.has(columnKey)) {
        const { error } = await supabase
          .from('customers')
          .update({ [columnKey]: value })
          .eq('id', customer.id)
        if (error) throw error
      } else {
        const nextCustom = { ...(customer.custom_fields || {}), [columnKey]: value }
        const { error } = await supabase
          .from('customers')
          .update({ custom_fields: nextCustom })
          .eq('id', customer.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanedCustomFields: Record<string, string | null> = {}
      for (const [k, v] of Object.entries(form.custom_fields)) {
        const trimmed = (v || '').trim()
        if (trimmed) cleanedCustomFields[k] = trimmed
      }

      const payload = {
        sheet_no: form.sheet_no.trim() || null,
        company_name: form.company_name.trim(),
        identity_number: form.identity_number.trim() || null,
        tax_code: form.tax_code.trim() || null,
        business_type: form.business_type,
        pic_name: form.pic_name.trim() || null,
        operating_status: form.operating_status.trim() || null,
        legal_representative: form.legal_representative.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        headquarters_address: form.headquarters_address.trim() || null,
        business_lines: form.business_lines.trim() || null,
        established_date: form.established_date || null,
        assigned_staff_id: form.assigned_staff_id || profile?.id || null,
        notes: form.notes.trim() || null,
        custom_fields: cleanedCustomFields
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
    const maxSheetNo = customers.reduce((max, c) => {
      const n = c.sheet_no && /^\d+$/.test(c.sheet_no.trim()) ? Number(c.sheet_no.trim()) : 0
      return Math.max(max, n)
    }, 0)
    setEditingId(null)
    setShowHiddenInForm(false)
    setForm({
      ...EMPTY_FORM,
      sheet_no: String(maxSheetNo + 1),
      assigned_staff_id: profile?.id || '',
      pic_name: activePicOptions[0]?.name || ''
    })
    setDialogOpen(true)
  }

  const openEdit = (c: Customer) => {
    const customMap: Record<string, string> = {}
    for (const [k, v] of Object.entries(c.custom_fields || {})) {
      if (v) customMap[k] = String(v)
    }
    setEditingId(c.id)
    setShowHiddenInForm(false)
    setForm({
      sheet_no: c.sheet_no || '',
      company_name: c.company_name,
      identity_number: c.identity_number || '',
      tax_code: c.tax_code || '',
      business_type: c.business_type,
      pic_name: c.pic_name || '',
      operating_status: c.operating_status || '',
      legal_representative: c.legal_representative || '',
      phone: c.phone || '',
      email: c.email || '',
      headquarters_address: c.headquarters_address || '',
      business_lines: c.business_lines || '',
      established_date: c.established_date || '',
      assigned_staff_id: c.assigned_staff_id || '',
      notes: c.notes || '',
      custom_fields: customMap
    })
    setDialogOpen(true)
  }

  const exportToExcel = () => {
    const rows = filtered.map((c) => {
      const obj: Record<string, string> = {}
      for (const col of visibleColumns) {
        obj[col.label] = getCustomerDisplayValue(c, col)
      }
      return obj
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'KhachHang')
    XLSX.writeFile(wb, 'Danh_sach_Khach_hang_BongSen.xlsx')
    toast.success(`Đã xuất ${rows.length} khách hàng ra Excel`)
  }

  const getFormValue = (key: string): string => {
    if (SYSTEM_COLUMN_KEYS.has(key)) {
      return (form[key as keyof Omit<CustomerFormState, 'custom_fields'>] as string) || ''
    }
    return form.custom_fields[key] || ''
  }

  const setFormValue = (key: string, value: string) => {
    if (SYSTEM_COLUMN_KEYS.has(key)) {
      setForm((prev) => ({ ...prev, [key]: value }))
    } else {
      setForm((prev) => ({
        ...prev,
        custom_fields: { ...prev.custom_fields, [key]: value }
      }))
    }
  }

  const renderFormField = (col: CustomerColumnConfig) => {
    const val = getFormValue(col.column_key)
    const isFullWidth = col.column_key === 'company_name' || col.column_key === 'headquarters_address' || col.field_type === 'textarea'

    if (col.column_key === 'pic_name') {
      const availableNames = new Set(activePicOptions.map((p) => p.name))
      const extraPic = val && !availableNames.has(val) ? val : null
      return (
        <div key={col.column_key} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label>{col.label}</Label>
            {canCreate && (
              <button
                type="button"
                onClick={() => setPicManagerOpen(true)}
                className="text-[11px] text-primary hover:underline"
              >
                + Define PIC
              </button>
            )}
          </div>
          <Select
            value={val || EMPTY_SELECT}
            onValueChange={(v) => setFormValue('pic_name', v === EMPTY_SELECT ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn PIC phụ trách" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_SELECT}>-- Chưa gán PIC --</SelectItem>
              {activePicOptions.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </span>
                </SelectItem>
              ))}
              {extraPic && <SelectItem value={extraPic}>{extraPic}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      )
    }

    if (col.column_key === 'business_type') {
      return (
        <div key={col.column_key} className="space-y-1">
          <Label>{col.label}</Label>
          <Select
            value={form.business_type}
            onValueChange={(v) => setForm((prev) => ({ ...prev, business_type: v as BusinessType }))}
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
      )
    }

    if (col.field_type === 'select') {
      const optionsList =
        col.column_key === 'operating_status'
          ? statusChoices
          : col.options.length > 0
            ? col.options
            : []
      return (
        <div key={col.column_key} className="space-y-1">
          <Label>{col.label}</Label>
          <Select
            value={val || EMPTY_SELECT}
            onValueChange={(v) => setFormValue(col.column_key, v === EMPTY_SELECT ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Chọn ${col.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_SELECT}>-- Trống --</SelectItem>
              {optionsList.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    if (col.field_type === 'textarea') {
      return (
        <div key={col.column_key} className="space-y-1 sm:col-span-2">
          <Label>{col.label}</Label>
          <Textarea
            rows={2}
            value={val}
            onChange={(e) => setFormValue(col.column_key, e.target.value)}
          />
        </div>
      )
    }

    return (
      <div key={col.column_key} className={`space-y-1 ${isFullWidth ? 'sm:col-span-2' : ''}`}>
        <Label>
          {col.label}
          {col.column_key === 'company_name' ? ' *' : ''}
        </Label>
        <Input
          required={col.column_key === 'company_name'}
          type={
            col.field_type === 'date'
              ? 'date'
              : col.field_type === 'number'
                ? 'number'
                : col.field_type === 'email'
                  ? 'email'
                  : 'text'
          }
          placeholder={
            col.column_key === 'company_name'
              ? 'VD: CÔNG TY TNHH...'
              : col.column_key === 'tax_code'
                ? 'VD: 0402xxxxxx-ql'
                : col.column_key === 'identity_number'
                  ? 'Số CCCD 12 số'
                  : undefined
          }
          value={val}
          onChange={(e) => setFormValue(col.column_key, e.target.value)}
        />
      </div>
    )
  }

  const renderCell = (c: Customer, col: CustomerColumnConfig) => {
    const editable = canEditRow(c)

    if (col.column_key === 'sheet_no') {
      return <span className="font-mono text-xs text-slate-500">{c.sheet_no || '—'}</span>
    }

    if (col.column_key === 'company_name') {
      return (
        <button
          type="button"
          onClick={() => navigate(`/customers/${c.id}`)}
          className="text-left group inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:text-primary"
        >
          <Building className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>{c.company_name}</span>
        </button>
      )
    }

    if (col.column_key === 'identity_number' || col.column_key === 'tax_code' || col.column_key === 'customer_code') {
      const val = getCustomerRawValue(c, col.column_key)
      return <span className="font-mono text-xs text-slate-700">{val || '—'}</span>
    }

    if (col.column_key === 'pic_name') {
      const picVal = c.pic_name || ''
      const color = picVal ? picColorMap.get(picVal) || '#2563eb' : '#94a3b8'
      if (!editable) {
        return picVal ? (
          <Badge variant="outline" className="text-xs font-medium" style={{ borderColor: color, color }}>
            {picVal}
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )
      }
      const hasCurrentInActive = !picVal || activePicOptions.some((p) => p.name === picVal)
      return (
        <Select
          value={picVal || EMPTY_SELECT}
          onValueChange={(v) =>
            quickUpdateMutation.mutate({
              customer: c,
              columnKey: 'pic_name',
              value: v === EMPTY_SELECT ? null : v
            })
          }
        >
          <SelectTrigger className="h-7 w-40 text-xs bg-white">
            <SelectValue>
              {picVal ? (
                <span className="inline-flex items-center gap-1.5 truncate">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="truncate font-medium">{picVal}</span>
                </span>
              ) : (
                <span className="text-slate-400">— Chọn PIC —</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SELECT}>— Trống —</SelectItem>
            {activePicOptions.map((p) => (
              <SelectItem key={p.id} value={p.name}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
              </SelectItem>
            ))}
            {!hasCurrentInActive && picVal && <SelectItem value={picVal}>{picVal}</SelectItem>}
          </SelectContent>
        </Select>
      )
    }

    if (col.column_key === 'operating_status') {
      const statusVal = c.operating_status || ''
      if (!editable) {
        return statusVal ? (
          <Badge variant="outline" className={`text-xs ${getStatusBadgeClass(statusVal)}`}>
            {statusVal}
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )
      }
      return (
        <Select
          value={statusVal || EMPTY_SELECT}
          onValueChange={(v) =>
            quickUpdateMutation.mutate({
              customer: c,
              columnKey: 'operating_status',
              value: v === EMPTY_SELECT ? null : v
            })
          }
        >
          <SelectTrigger className={`h-7 w-40 text-xs font-medium border ${getStatusBadgeClass(statusVal)}`}>
            <SelectValue placeholder="— Trạng thái —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SELECT}>— Trống —</SelectItem>
            {statusChoices.map((st) => (
              <SelectItem key={st} value={st}>
                {st}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    if (!col.is_system && col.field_type === 'select' && editable && col.options.length > 0) {
      const rawVal = getCustomerRawValue(c, col.column_key)
      return (
        <Select
          value={rawVal || EMPTY_SELECT}
          onValueChange={(v) =>
            quickUpdateMutation.mutate({
              customer: c,
              columnKey: col.column_key,
              value: v === EMPTY_SELECT ? null : v
            })
          }
        >
          <SelectTrigger className="h-7 min-w-[130px] text-xs bg-white">
            <SelectValue placeholder="— Chọn —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EMPTY_SELECT}>— Trống —</SelectItem>
            {col.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    const display = getCustomerDisplayValue(c, col)
    return (
      <span className="text-xs text-slate-700 whitespace-pre-wrap">
        {display || <span className="text-slate-300">—</span>}
      </span>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản lý Khách hàng (CRM)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cấu trúc cột đồng bộ theo Sheet Nhi_BCT, hỗ trợ bật/thêm cột tùy ý và cấu hình droplist PIC trực tiếp.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <>
              <Button variant="outline" size="sm" onClick={() => setColumnsDialogOpen(true)}>
                <Columns3 className="h-4 w-4" />
                Tùy chỉnh cột ({visibleColumns.length})
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPicManagerOpen(true)}>
                <UserCog className="h-4 w-4" />
                Cấu hình PIC ({activePicOptions.length})
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
          {canCreate && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="h-4 w-4" />
                Import Excel / Sheet
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Thêm khách hàng
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="relative md:col-span-5">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm No., doanh nghiệp, số định danh, MST, PIC, chủ DN, SĐT..."
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="md:col-span-3">
            <Select
              value={picFilter}
              onValueChange={(v) => {
                setPicFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Lọc theo PIC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả PIC</SelectItem>
                <SelectItem value="__UNASSIGNED__">Chưa gán PIC</SelectItem>
                {activePicOptions.map((p) => (
                  <SelectItem key={p.id} value={p.name}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {statusChoices.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Sắp xếp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sheet_no">Theo No. (như Sheet)</SelectItem>
                <SelectItem value="updated_desc">Mới cập nhật</SelectItem>
                <SelectItem value="name_asc">Tên DN (A → Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">
            Danh sách khách hàng ({filtered.length})
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Hiển thị:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v))
                setPage(1)
              }}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 dòng</SelectItem>
                <SelectItem value="50">50 dòng</SelectItem>
                <SelectItem value="100">100 dòng</SelectItem>
                <SelectItem value="0">Tất cả</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-y border-slate-200 text-xs text-slate-600 uppercase">
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col.id} className="px-3 py-3 whitespace-nowrap font-semibold">
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right whitespace-nowrap font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="px-4 py-8 text-center text-xs text-slate-400"
                  >
                    Đang tải dữ liệu khách hàng...
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 1}
                    className="px-4 py-8 text-center text-xs text-slate-400"
                  >
                    Không tìm thấy khách hàng nào
                  </td>
                </tr>
              ) : (
                paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    {visibleColumns.map((col) => (
                      <td key={col.id} className="px-3 py-2.5 align-middle">
                        {renderCell(c, col)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Xem chi tiết 360°"
                          onClick={() => navigate(`/customers/${c.id}`)}
                        >
                          <Eye className="h-4 w-4 text-slate-600" />
                        </Button>
                        {canEditRow(c) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Chỉnh sửa"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="h-4 w-4 text-slate-600" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
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
                Trang {safePage} / {totalPages} (tổng {filtered.length} khách hàng)
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Thêm / Sửa khách hàng (Render động theo cấu hình cột) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Cập nhật thông tin khách hàng' : 'Thêm khách hàng mới'}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate()
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleFormColumns.map((col) => renderFormField(col))}
            </div>

            {hiddenFormColumns.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowHiddenInForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-primary"
                >
                  {showHiddenInForm ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  Thông tin mở rộng khác ({hiddenFormColumns.length} cột đang ẩn trên bảng: Địa chỉ, Ghi chú...)
                </button>
                {showHiddenInForm && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {hiddenFormColumns.map((col) => renderFormField(col))}
                    <div className="space-y-1">
                      <Label>Tài khoản nhân viên phụ trách (hệ thống)</Label>
                      <Select
                        value={form.assigned_staff_id || EMPTY_SELECT}
                        onValueChange={(v) =>
                          setForm((prev) => ({
                            ...prev,
                            assigned_staff_id: v === EMPTY_SELECT ? '' : v
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn tài khoản" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>-- Chưa gắn tài khoản --</SelectItem>
                          {staffList.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}

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

      <ImportCustomersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        customColumns={allColumns.filter((c) => !c.is_system)}
      />
      <CustomerPicManagerDialog
        open={picManagerOpen}
        onOpenChange={setPicManagerOpen}
        picOptions={picOptions}
      />
      <CustomerColumnsDialog
        open={columnsDialogOpen}
        onOpenChange={setColumnsDialogOpen}
        columns={allColumns}
      />
    </div>
  )
}
