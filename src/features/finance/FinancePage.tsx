import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wallet, TrendingUp, AlertCircle, Receipt, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_TYPE_LABELS,
  formatCurrency,
  formatDate
} from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { CasePayment, PaymentMethod, PaymentType, ServiceCase } from '@/types/database'

interface PaymentWithCase extends CasePayment {
  service_case?: {
    id: string
    case_code: string
    procedure_name: string
    customer?: { company_name: string } | null
  } | null
}

export function FinancePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canRecord = Permissions.canRecordPayments(profile?.role)

  const [payCaseTarget, setPayCaseTarget] = useState<ServiceCase | null>(null)
  const [payForm, setPayForm] = useState({
    payment_type: 'installment' as PaymentType,
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'bank_transfer' as PaymentMethod,
    reference_no: ''
  })

  const { data: cases = [] } = useQuery({
    queryKey: ['finance-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cases')
        .select(
          '*, customer:customers(id, company_name), service:services(id, name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(id, full_name), case_financials(*)'
        )
        .order('received_date', { ascending: false })
      if (error) throw error
      return data as unknown as ServiceCase[]
    }
  })

  const { data: payments = [] } = useQuery({
    queryKey: ['finance-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_payments')
        .select('*, service_case:service_cases(id, case_code, procedure_name, customer:customers(company_name))')
        .order('payment_date', { ascending: false })
      if (error) throw error
      return data as unknown as PaymentWithCase[]
    }
  })

  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!payCaseTarget) return
      const { error } = await supabase.from('case_payments').insert({
        case_id: payCaseTarget.id,
        payment_type: payForm.payment_type,
        amount: Number(payForm.amount),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        reference_no: payForm.reference_no.trim() || null,
        recorded_by: profile!.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã ghi nhận thanh toán')
      setPayCaseTarget(null)
      setPayForm({
        payment_type: 'installment',
        amount: '',
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: 'bank_transfer',
        reference_no: ''
      })
      queryClient.invalidateQueries({ queryKey: ['finance-cases'] })
      queryClient.invalidateQueries({ queryKey: ['finance-payments'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const summary = useMemo(() => {
    let totalContract = 0
    let totalPaid = 0
    let totalDebt = 0
    let totalExpenses = 0
    for (const c of cases) {
      if (c.kanban_status === 'cancelled') continue
      totalContract += Number(c.case_financials?.contract_value || 0)
      totalPaid += Number(c.case_financials?.paid_amount || 0)
      totalDebt += Number(c.case_financials?.remaining_debt || 0)
      totalExpenses += Number(c.case_financials?.incurred_cost || 0)
    }
    return { totalContract, totalPaid, totalDebt, totalExpenses }
  }, [cases])

  const debtCases = useMemo(
    () =>
      cases.filter(
        (c) => c.kanban_status !== 'cancelled' && Number(c.case_financials?.remaining_debt || 0) > 0
      ),
    [cases]
  )

  const revenueByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments) {
      const month = p.payment_date.slice(0, 7)
      map.set(month, (map.get(month) || 0) + Number(p.amount))
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [payments])

  const revenueByService = useMemo(() => {
    const map = new Map<string, { contract: number; paid: number; count: number }>()
    for (const c of cases) {
      if (c.kanban_status === 'cancelled') continue
      const key = c.service?.name || 'Khác'
      const cur = map.get(key) || { contract: 0, paid: 0, count: 0 }
      cur.contract += Number(c.case_financials?.contract_value || 0)
      cur.paid += Number(c.case_financials?.paid_amount || 0)
      cur.count += 1
      map.set(key, cur)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].paid - a[1].paid)
  }, [cases])

  const revenueByStaff = useMemo(() => {
    const map = new Map<string, { contract: number; paid: number; debt: number; count: number }>()
    for (const c of cases) {
      if (c.kanban_status === 'cancelled') continue
      const key = c.assigned_staff?.full_name || 'Chưa phân công'
      const cur = map.get(key) || { contract: 0, paid: 0, debt: 0, count: 0 }
      cur.contract += Number(c.case_financials?.contract_value || 0)
      cur.paid += Number(c.case_financials?.paid_amount || 0)
      cur.debt += Number(c.case_financials?.remaining_debt || 0)
      cur.count += 1
      map.set(key, cur)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].paid - a[1].paid)
  }, [cases])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Quản lý Tài chính &amp; Công nợ</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Theo dõi giá trị hợp đồng, đặt cọc, các lần thu tiền, chi phí phát sinh và công nợ từng hồ sơ.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Tổng giá trị hợp đồng</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(summary.totalContract)}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Tổng thực thu</div>
              <div className="text-xl font-bold text-emerald-700 mt-1">{formatCurrency(summary.totalPaid)}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Công nợ khách hàng</div>
              <div className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(summary.totalDebt)}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Chi phí phát sinh</div>
              <div className="text-xl font-bold text-slate-700 mt-1">{formatCurrency(summary.totalExpenses)}</div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <Receipt className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="debt">
        <TabsList>
          <TabsTrigger value="debt">Hồ sơ chưa thanh toán đủ ({debtCases.length})</TabsTrigger>
          <TabsTrigger value="payments">Lịch sử thu tiền ({payments.length})</TabsTrigger>
          <TabsTrigger value="by-month">Doanh thu theo tháng</TabsTrigger>
          <TabsTrigger value="by-service">Theo dịch vụ</TabsTrigger>
          <TabsTrigger value="by-staff">Theo nhân viên</TabsTrigger>
        </TabsList>

        <TabsContent value="debt">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Mã hồ sơ</th>
                    <th className="px-4 py-3">Khách hàng / Dịch vụ</th>
                    <th className="px-4 py-3 text-right">Giá hợp đồng</th>
                    <th className="px-4 py-3 text-right">Đã thu</th>
                    <th className="px-4 py-3 text-right">Còn nợ</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debtCases.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/cases/${c.id}`)}
                          className="font-semibold text-primary hover:underline"
                        >
                          {c.case_code}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{c.customer?.company_name}</div>
                        <div className="text-slate-500">{c.service?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(c.case_financials?.contract_value)}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">
                        {formatCurrency(c.case_financials?.paid_amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">
                        {formatCurrency(c.case_financials?.remaining_debt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canRecord && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setPayCaseTarget(c)
                              setPayForm((p) => ({
                                ...p,
                                amount: String(c.case_financials?.remaining_debt || 0)
                              }))
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Thu tiền
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Ngày thu</th>
                    <th className="px-4 py-3">Hồ sơ / Khách hàng</th>
                    <th className="px-4 py-3">Đợt / Hình thức</th>
                    <th className="px-4 py-3">Mã tham chiếu</th>
                    <th className="px-4 py-3 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-primary">{p.service_case?.case_code}</div>
                        <div className="text-slate-600">{p.service_case?.customer?.company_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        {PAYMENT_TYPE_LABELS[p.payment_type]} • {PAYMENT_METHOD_LABELS[p.payment_method]}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{p.reference_no || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                        {formatCurrency(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-month">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Thực thu theo tháng</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Tháng</th>
                    <th className="px-4 py-3 text-right">Tổng tiền đã thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revenueByMonth.map(([month, total]) => (
                    <tr key={month}>
                      <td className="px-4 py-3 font-medium">{month}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                        {formatCurrency(total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-service">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Loại dịch vụ</th>
                    <th className="px-4 py-3 text-center">Số hồ sơ</th>
                    <th className="px-4 py-3 text-right">Tổng hợp đồng</th>
                    <th className="px-4 py-3 text-right">Đã thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revenueByService.map(([svc, val]) => (
                    <tr key={svc}>
                      <td className="px-4 py-3 font-medium">{svc}</td>
                      <td className="px-4 py-3 text-center">{val.count}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(val.contract)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                        {formatCurrency(val.paid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-staff">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Nhân viên phụ trách</th>
                    <th className="px-4 py-3 text-center">Số hồ sơ</th>
                    <th className="px-4 py-3 text-right">Tổng hợp đồng</th>
                    <th className="px-4 py-3 text-right">Đã thu</th>
                    <th className="px-4 py-3 text-right">Công nợ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revenueByStaff.map(([staff, val]) => (
                    <tr key={staff}>
                      <td className="px-4 py-3 font-medium">{staff}</td>
                      <td className="px-4 py-3 text-center">{val.count}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(val.contract)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                        {formatCurrency(val.paid)}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(val.debt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(payCaseTarget)} onOpenChange={(o) => !o && setPayCaseTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thu tiền hồ sơ {payCaseTarget?.case_code}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              recordPaymentMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Đợt thu</Label>
                <Select
                  value={payForm.payment_type}
                  onValueChange={(v) => setPayForm({ ...payForm, payment_type: v as PaymentType })}
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
                  value={payForm.payment_method}
                  onValueChange={(v) => setPayForm({ ...payForm, payment_method: v as PaymentMethod })}
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
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Ngày thu *</Label>
                <Input
                  type="date"
                  required
                  value={payForm.payment_date}
                  onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mã giao dịch / Số phiếu thu</Label>
              <Input
                value={payForm.reference_no}
                onChange={(e) => setPayForm({ ...payForm, reference_no: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayCaseTarget(null)}>
                Hủy
              </Button>
              <Button type="submit" disabled={recordPaymentMutation.isPending}>
                Lưu khoản thu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
