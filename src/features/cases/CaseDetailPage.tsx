import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  GitBranch,
  Files,
  Wallet,
  History,
  Upload,
  Download,
  Eye,
  Plus,
  AlertCircle
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import {
  KANBAN_COLUMNS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  isOverdue
} from '@/lib/formatters'
import { CaseWorkflowTab } from '@/features/workflow/CaseWorkflowTab'
import { PriorityBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type {
  AuditLog,
  CaseDocument,
  CaseExpense,
  CasePayment,
  DocumentAccessScope,
  KanbanStatus,
  PaymentMethod,
  PaymentType,
  Profile,
  ServiceCase
} from '@/types/database'

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const canViewFinance = Permissions.canViewFinance(profile?.role)
  const canRecordPayments = Permissions.canRecordPayments(profile?.role)
  const canAssign = Permissions.canAssignCases(profile?.role)

  const [paymentOpen, setPaymentOpen] = useState(false)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docScope, setDocScope] = useState<DocumentAccessScope>('case_team')

  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'installment' as PaymentType,
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'bank_transfer' as PaymentMethod,
    reference_no: '',
    notes: ''
  })

  const [expenseForm, setExpenseForm] = useState({
    title: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    notes: ''
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

  const { data: serviceCase, isLoading } = useQuery({
    queryKey: ['service-case', id, canViewFinance],
    enabled: Boolean(id),
    queryFn: async () => {
      const selectClause = canViewFinance
        ? '*, customer:customers(*), service:services(*), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(id, full_name, employee_code), case_financials(*)'
        : '*, customer:customers(*), service:services(*), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(id, full_name, employee_code)'
      const { data, error } = await supabase
        .from('service_cases')
        .select(selectClause)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as ServiceCase
    }
  })

  const { data: payments = [] } = useQuery({
    queryKey: ['case-payments', id],
    enabled: Boolean(id) && canViewFinance,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_payments')
        .select('*')
        .eq('case_id', id!)
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data as CasePayment[]
    }
  })

  const { data: expenses = [] } = useQuery({
    queryKey: ['case-expenses', id],
    enabled: Boolean(id) && canViewFinance,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_expenses')
        .select('*')
        .eq('case_id', id!)
        .order('expense_date', { ascending: false })
      if (error) throw error
      return data as CaseExpense[]
    }
  })

  const { data: documents = [] } = useQuery({
    queryKey: ['case-documents', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, uploader:profiles(id, full_name)')
        .eq('case_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CaseDocument[]
    }
  })

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['case-audit-logs', id],
    enabled: Boolean(id) && Permissions.canViewAuditLogs(profile?.role),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*, actor:profiles(id, full_name, email)')
        .eq('entity_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as AuditLog[]
    }
  })

  const updateCaseMutation = useMutation({
    mutationFn: async (updates: Partial<ServiceCase>) => {
      const { error } = await supabase.from('service_cases').update(updates).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã cập nhật hồ sơ')
      queryClient.invalidateQueries({ queryKey: ['service-case', id] })
      queryClient.invalidateQueries({ queryKey: ['service-cases'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const addPaymentMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('case_payments').insert({
        case_id: id!,
        payment_type: paymentForm.payment_type,
        amount: Number(paymentForm.amount),
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        reference_no: paymentForm.reference_no.trim() || null,
        notes: paymentForm.notes.trim() || null,
        recorded_by: profile!.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã ghi nhận khoản thu')
      setPaymentOpen(false)
      setPaymentForm({
        payment_type: 'installment',
        amount: '',
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: 'bank_transfer',
        reference_no: '',
        notes: ''
      })
      queryClient.invalidateQueries({ queryKey: ['case-payments', id] })
      queryClient.invalidateQueries({ queryKey: ['service-case', id] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const addExpenseMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('case_expenses').insert({
        case_id: id!,
        title: expenseForm.title.trim(),
        amount: Number(expenseForm.amount),
        expense_date: expenseForm.expense_date,
        notes: expenseForm.notes.trim() || null,
        recorded_by: profile!.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã ghi nhận chi phí phát sinh')
      setExpenseOpen(false)
      setExpenseForm({ title: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), notes: '' })
      queryClient.invalidateQueries({ queryKey: ['case-expenses', id] })
      queryClient.invalidateQueries({ queryKey: ['service-case', id] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !serviceCase) return
    setUploading(true)
    try {
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const storagePath = `${serviceCase.customer_id}/${serviceCase.id}/${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('case-documents')
        .upload(storagePath, file)
      if (uploadErr) throw uploadErr

      const { error: dbErr } = await supabase.from('documents').insert({
        customer_id: serviceCase.customer_id,
        case_id: serviceCase.id,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        access_scope: docScope,
        uploaded_by: profile?.id
      })
      if (dbErr) throw dbErr

      toast.success(`Đã tải lên ${file.name}`)
      queryClient.invalidateQueries({ queryKey: ['case-documents', id] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleOpenSignedUrl = async (doc: CaseDocument, download = false) => {
    const { data, error } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(doc.storage_path, 120, download ? { download: doc.file_name } : undefined)
    if (error || !data?.signedUrl) {
      toast.error('Không tạo được liên kết tải tài liệu')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (isLoading) return <div className="p-8 text-center text-xs text-slate-400">Đang tải hồ sơ...</div>
  if (!serviceCase) return <div className="p-8 text-center text-sm text-slate-500">Không tìm thấy hồ sơ.</div>

  const overdue = isOverdue(serviceCase.due_date, serviceCase.kanban_status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/cases')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">{serviceCase.case_code}</span>
              <PriorityBadge priority={serviceCase.priority} />
              {overdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-0.5 text-xs font-medium">
                  <AlertCircle className="h-3 w-3" /> Quá hạn
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900 mt-1">{serviceCase.procedure_name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Khách hàng:{' '}
              <button
                type="button"
                onClick={() => navigate(`/customers/${serviceCase.customer_id}`)}
                className="font-semibold text-slate-800 hover:text-primary hover:underline"
              >
                {serviceCase.customer?.company_name}
              </button>{' '}
              • Dịch vụ: {serviceCase.service?.name} • Hạn hoàn thành: {formatDate(serviceCase.due_date)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={serviceCase.kanban_status}
            onValueChange={(v) => updateCaseMutation.mutate({ kanban_status: v as KanbanStatus })}
          >
            <SelectTrigger className="w-48 h-9 text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KANBAN_COLUMNS.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canAssign && (
            <Select
              value={serviceCase.assigned_staff_id || ''}
              onValueChange={(v) => updateCaseMutation.mutate({ assigned_staff_id: v || null })}
            >
              <SelectTrigger className="w-48 h-9 text-xs">
                <SelectValue placeholder="Chuyển giao phụ trách" />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workflow">
        <TabsList>
          <TabsTrigger value="workflow">
            <GitBranch className="h-4 w-4 mr-1.5" />
            Quy trình xử lý
          </TabsTrigger>
          <TabsTrigger value="documents">
            <Files className="h-4 w-4 mr-1.5" />
            Tài liệu ({documents.length})
          </TabsTrigger>
          {canViewFinance && (
            <TabsTrigger value="finance">
              <Wallet className="h-4 w-4 mr-1.5" />
              Tài chính &amp; Công nợ
            </TabsTrigger>
          )}
          {Permissions.canViewAuditLogs(profile?.role) && (
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1.5" />
              Lịch sử cập nhật
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="workflow">
          <CaseWorkflowTab caseId={serviceCase.id} staffList={staffList} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-sm">Tài liệu đính kèm hồ sơ</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={docScope}
                  onValueChange={(v) => setDocScope(v as DocumentAccessScope)}
                >
                  <SelectTrigger className="w-44 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="case_team">Nhóm xử lý hồ sơ</SelectItem>
                    <SelectItem value="all_staff">Toàn bộ nhân viên</SelectItem>
                    <SelectItem value="managers_only">Chỉ Quản lý / Admin</SelectItem>
                    <SelectItem value="finance">Phòng Kế toán / Tài chính</SelectItem>
                  </SelectContent>
                </Select>
                <label className="inline-flex items-center gap-2 rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-blue-700">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{uploading ? 'Đang tải lên...' : 'Upload tài liệu'}</span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Tên tài liệu</th>
                    <th className="px-4 py-3">Dung lượng</th>
                    <th className="px-4 py-3">Phạm vi quyền</th>
                    <th className="px-4 py-3">Người tải lên</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                        Chưa có tài liệu nào cho hồ sơ này
                      </td>
                    </tr>
                  ) : (
                    documents.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{d.file_name}</td>
                        <td className="px-4 py-2.5 text-slate-500">{formatFileSize(d.file_size)}</td>
                        <td className="px-4 py-2.5 text-slate-600">{d.access_scope}</td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {d.uploader?.full_name || '—'} • {formatDate(d.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right space-x-1">
                          <Button size="sm" variant="ghost" onClick={() => handleOpenSignedUrl(d, false)}>
                            <Eye className="h-3.5 w-3.5" /> Xem
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleOpenSignedUrl(d, true)}>
                            <Download className="h-3.5 w-3.5" /> Tải
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {canViewFinance && (
          <TabsContent value="finance" className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-slate-500">Giá trị hợp đồng</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">
                    {formatCurrency(serviceCase.case_financials?.contract_value)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-slate-500">Đã thu khách hàng</div>
                  <div className="text-lg font-bold text-emerald-700 mt-1">
                    {formatCurrency(serviceCase.case_financials?.paid_amount)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-slate-500">Công nợ còn lại</div>
                  <div className="text-lg font-bold text-amber-600 mt-1">
                    {formatCurrency(serviceCase.case_financials?.remaining_debt)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-xs text-slate-500">Chi phí phát sinh</div>
                  <div className="text-lg font-bold text-slate-700 mt-1">
                    {formatCurrency(serviceCase.case_financials?.incurred_cost)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-sm">Lịch sử thanh toán</CardTitle>
                  {canRecordPayments && (
                    <Button size="sm" onClick={() => setPaymentOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Thu tiền
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Ngày</th>
                        <th className="px-4 py-2">Loại / Hình thức</th>
                        <th className="px-4 py-2 text-right">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-5 text-center text-slate-400">
                            Chưa có giao dịch thu tiền
                          </td>
                        </tr>
                      ) : (
                        payments.map((p) => (
                          <tr key={p.id}>
                            <td className="px-4 py-2">{formatDate(p.payment_date)}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium">{PAYMENT_TYPE_LABELS[p.payment_type]}</div>
                              <div className="text-slate-400">
                                {PAYMENT_METHOD_LABELS[p.payment_method]} {p.reference_no ? `• ${p.reference_no}` : ''}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-emerald-700">
                              {formatCurrency(p.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-sm">Chi phí phát sinh / Lệ phí</CardTitle>
                  {canRecordPayments && (
                    <Button size="sm" variant="outline" onClick={() => setExpenseOpen(true)}>
                      <Plus className="h-3.5 w-3.5" /> Ghi chi phí
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Ngày</th>
                        <th className="px-4 py-2">Nội dung</th>
                        <th className="px-4 py-2 text-right">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-5 text-center text-slate-400">
                            Chưa ghi nhận chi phí phát sinh
                          </td>
                        </tr>
                      ) : (
                        expenses.map((ex) => (
                          <tr key={ex.id}>
                            <td className="px-4 py-2">{formatDate(ex.expense_date)}</td>
                            <td className="px-4 py-2 font-medium">{ex.title}</td>
                            <td className="px-4 py-2 text-right font-semibold text-slate-800">
                              {formatCurrency(ex.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {Permissions.canViewAuditLogs(profile?.role) && (
          <TabsContent value="history">
            <Card>
              <CardContent className="pt-4 space-y-2">
                {auditLogs.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">Chưa có lịch sử cập nhật</div>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                      <div>
                        <span className="font-semibold text-slate-800">{log.actor?.full_name || 'Hệ thống'}</span> đã
                        thực hiện <span className="font-mono text-primary">{log.action}</span>
                      </div>
                      <span className="text-slate-400">{formatDateTime(log.created_at)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialog Thu tiền */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi nhận thanh toán</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addPaymentMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Đợt thanh toán</Label>
                <Select
                  value={paymentForm.payment_type}
                  onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_type: v as PaymentType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">Đặt cọc</SelectItem>
                    <SelectItem value="installment">Thanh toán đợt</SelectItem>
                    <SelectItem value="final">Tất toán</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Phương thức</Label>
                <Select
                  value={paymentForm.payment_method}
                  onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_method: v as PaymentMethod })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Chuyển khoản</SelectItem>
                    <SelectItem value="cash">Tiền mặt</SelectItem>
                    <SelectItem value="card">Thẻ</SelectItem>
                    <SelectItem value="other">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Số tiền (VNĐ) *</Label>
                <Input
                  type="number"
                  min={1000}
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày thu *</Label>
                <Input
                  type="date"
                  required
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mã tham chiếu / Số phiếu thu</Label>
              <Input
                value={paymentForm.reference_no}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference_no: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={addPaymentMutation.isPending}>
                Lưu khoản thu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Chi phí phát sinh */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi nhận chi phí phát sinh</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addExpenseMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Nội dung chi phí *</Label>
              <Input
                required
                placeholder="VD: Lệ phí nộp Sở KH&ĐT / Khắc dấu"
                value={expenseForm.title}
                onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Số tiền (VNĐ) *</Label>
                <Input
                  type="number"
                  min={0}
                  required
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày chi *</Label>
                <Input
                  type="date"
                  required
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExpenseOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={addExpenseMutation.isPending}>
                Lưu chi phí
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
