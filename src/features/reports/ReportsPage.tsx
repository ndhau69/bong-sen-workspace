import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import {
  BUSINESS_TYPE_LABELS,
  KANBAN_COLUMNS,
  KANBAN_STATUS_MAP,
  formatCurrency,
  formatDate,
  isOverdue
} from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { CaseStep, Customer, Profile, ServiceCase, ServiceItem } from '@/types/database'

export function ReportsPage() {
  const { profile } = useAuth()
  const canViewFinance = Permissions.canViewFinance(profile?.role)

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [staffFilter, setStaffFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name')
      if (error) throw error
      return data as Pick<Profile, 'id' | 'full_name'>[]
    }
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services-options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('id, name').order('name')
      if (error) throw error
      return data as Pick<ServiceItem, 'id' | 'name'>[]
    }
  })

  const { data: cases = [] } = useQuery({
    queryKey: ['report-cases', canViewFinance],
    queryFn: async () => {
      const selectClause = canViewFinance
        ? '*, customer:customers(company_name, tax_code), service:services(name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(full_name), case_financials(*)'
        : '*, customer:customers(company_name, tax_code), service:services(name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(full_name)'
      const { data, error } = await supabase.from('service_cases').select(selectClause).order('received_date', { ascending: false })
      if (error) throw error
      return data as unknown as ServiceCase[]
    }
  })

  const { data: steps = [] } = useQuery({
    queryKey: ['report-steps'],
    queryFn: async () => {
      const { data, error } = await supabase.from('case_steps').select('id, case_id, status')
      if (error) throw error
      return data as Pick<CaseStep, 'id' | 'case_id' | 'status'>[]
    }
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['report-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, assigned_staff:profiles!customers_assigned_staff_id_fkey(full_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Customer[]
    }
  })

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (fromDate && c.received_date < fromDate) return false
      if (toDate && c.received_date > toDate) return false
      if (staffFilter !== 'all' && c.assigned_staff_id !== staffFilter) return false
      if (serviceFilter !== 'all' && c.service_id !== serviceFilter) return false
      if (statusFilter !== 'all' && c.kanban_status !== statusFilter) return false
      return true
    })
  }, [cases, fromDate, toDate, staffFilter, serviceFilter, statusFilter])

  const progressByCase = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()
    for (const s of steps) {
      const cur = map.get(s.case_id) || { done: 0, total: 0 }
      cur.total += 1
      if (s.status === 'completed' || s.status === 'skipped') cur.done += 1
      map.set(s.case_id, cur)
    }
    return map
  }, [steps])

  const overdueCases = useMemo(
    () => filteredCases.filter((c) => isOverdue(c.due_date, c.kanban_status)),
    [filteredCases]
  )

  const staffPerformance = useMemo(() => {
    const map = new Map<string, { name: string; total: number; completed: number; overdue: number }>()
    for (const c of filteredCases) {
      const key = c.assigned_staff_id || 'unassigned'
      const cur = map.get(key) || {
        name: c.assigned_staff?.full_name || 'Chưa phân công',
        total: 0,
        completed: 0,
        overdue: 0
      }
      cur.total += 1
      if (c.kanban_status === 'completed') cur.completed += 1
      if (isOverdue(c.due_date, c.kanban_status)) cur.overdue += 1
      map.set(key, cur)
    }
    return Array.from(map.values())
  }, [filteredCases])

  const exportExcel = (filename: string, rows: Record<string, unknown>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCao')
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Báo cáo &amp; Thống kê (Xuất Excel)</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Truy xuất báo cáo trực tiếp từ cơ sở dữ liệu theo khoảng thời gian, nhân viên, dịch vụ và trạng thái.
        </p>
      </div>

      {/* Bộ lọc */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="Từ ngày" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} title="Đến ngày" />
          <Select value={staffFilter} onValueChange={setStaffFilter}>
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
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Dịch vụ" />
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              {KANBAN_COLUMNS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Tổng hợp hồ sơ</TabsTrigger>
          <TabsTrigger value="progress">Tiến độ xử lý</TabsTrigger>
          <TabsTrigger value="overdue">Hồ sơ quá hạn ({overdueCases.length})</TabsTrigger>
          <TabsTrigger value="staff">Hiệu suất nhân viên</TabsTrigger>
          {canViewFinance && <TabsTrigger value="finance">Doanh thu &amp; Công nợ</TabsTrigger>}
          <TabsTrigger value="customers">Lịch sử tiếp nhận KH</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Tổng hợp hồ sơ ({filteredCases.length})</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportExcel(
                    'BaoCao_TongHopHoSo',
                    filteredCases.map((c) => ({
                      'Mã hồ sơ': c.case_code,
                      'Khách hàng': c.customer?.company_name,
                      'Dịch vụ': c.service?.name,
                      'Thủ tục': c.procedure_name,
                      'Nhân viên': c.assigned_staff?.full_name || '',
                      'Ngày nhận': c.received_date,
                      'Hạn hoàn thành': c.due_date || '',
                      'Trạng thái': KANBAN_STATUS_MAP[c.kanban_status].label
                    }))
                  )
                }
              >
                <Download className="h-4 w-4" /> Xuất Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Mã HS</th>
                    <th className="px-4 py-2.5">Khách hàng</th>
                    <th className="px-4 py-2.5">Dịch vụ</th>
                    <th className="px-4 py-2.5">Phụ trách</th>
                    <th className="px-4 py-2.5">Ngày nhận</th>
                    <th className="px-4 py-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCases.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-semibold text-primary">{c.case_code}</td>
                      <td className="px-4 py-2.5">{c.customer?.company_name}</td>
                      <td className="px-4 py-2.5">{c.service?.name}</td>
                      <td className="px-4 py-2.5">{c.assigned_staff?.full_name || '—'}</td>
                      <td className="px-4 py-2.5">{formatDate(c.received_date)}</td>
                      <td className="px-4 py-2.5">{KANBAN_STATUS_MAP[c.kanban_status].label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Tiến độ xử lý từng hồ sơ</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportExcel(
                    'BaoCao_TienDoHoSo',
                    filteredCases.map((c) => {
                      const pr = progressByCase.get(c.id) || { done: 0, total: 0 }
                      return {
                        'Mã hồ sơ': c.case_code,
                        'Khách hàng': c.customer?.company_name,
                        'Bước hoàn thành': `${pr.done}/${pr.total}`,
                        'Tỷ lệ (%)': pr.total ? Math.round((pr.done / pr.total) * 100) : 0
                      }
                    })
                  )
                }
              >
                <Download className="h-4 w-4" /> Xuất Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Mã HS</th>
                    <th className="px-4 py-2.5">Thủ tục</th>
                    <th className="px-4 py-2.5">Số bước xong</th>
                    <th className="px-4 py-2.5">Tiến độ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCases.map((c) => {
                    const pr = progressByCase.get(c.id) || { done: 0, total: 0 }
                    const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 font-semibold text-primary">{c.case_code}</td>
                        <td className="px-4 py-2.5">{c.procedure_name}</td>
                        <td className="px-4 py-2.5">
                          {pr.done}/{pr.total}
                        </td>
                        <td className="px-4 py-2.5 font-semibold">{pct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm text-red-700">Hồ sơ quá hạn ({overdueCases.length})</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportExcel(
                    'BaoCao_HoSoQuaHan',
                    overdueCases.map((c) => ({
                      'Mã hồ sơ': c.case_code,
                      'Khách hàng': c.customer?.company_name,
                      'Phụ trách': c.assigned_staff?.full_name || '',
                      'Hạn xử lý': c.due_date || '',
                      'Lý do chậm': c.delay_reason || ''
                    }))
                  )
                }
              >
                <Download className="h-4 w-4" /> Xuất Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Mã HS</th>
                    <th className="px-4 py-2.5">Khách hàng</th>
                    <th className="px-4 py-2.5">Phụ trách</th>
                    <th className="px-4 py-2.5">Deadline</th>
                    <th className="px-4 py-2.5">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overdueCases.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-semibold text-red-600">{c.case_code}</td>
                      <td className="px-4 py-2.5">{c.customer?.company_name}</td>
                      <td className="px-4 py-2.5">{c.assigned_staff?.full_name || '—'}</td>
                      <td className="px-4 py-2.5 text-red-600 font-semibold">{formatDate(c.due_date)}</td>
                      <td className="px-4 py-2.5">{KANBAN_STATUS_MAP[c.kanban_status].label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Hiệu suất nhân viên</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportExcel(
                    'BaoCao_HieuSuatNhanVien',
                    staffPerformance.map((s) => ({
                      'Nhân viên': s.name,
                      'Tổng hồ sơ': s.total,
                      'Hoàn thành': s.completed,
                      'Quá hạn': s.overdue,
                      'Tỷ lệ hoàn thành (%)': s.total ? Math.round((s.completed / s.total) * 100) : 0
                    }))
                  )
                }
              >
                <Download className="h-4 w-4" /> Xuất Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Nhân viên</th>
                    <th className="px-4 py-2.5 text-center">Tổng hồ sơ</th>
                    <th className="px-4 py-2.5 text-center">Hoàn thành</th>
                    <th className="px-4 py-2.5 text-center">Quá hạn</th>
                    <th className="px-4 py-2.5 text-center">Tỷ lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffPerformance.map((s) => (
                    <tr key={s.name}>
                      <td className="px-4 py-2.5 font-medium">{s.name}</td>
                      <td className="px-4 py-2.5 text-center">{s.total}</td>
                      <td className="px-4 py-2.5 text-center text-emerald-700 font-semibold">{s.completed}</td>
                      <td className="px-4 py-2.5 text-center text-red-600">{s.overdue}</td>
                      <td className="px-4 py-2.5 text-center font-semibold">
                        {s.total ? Math.round((s.completed / s.total) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {canViewFinance && (
          <TabsContent value="finance">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm">Doanh thu &amp; Công nợ</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    exportExcel(
                      'BaoCao_DoanhThuCongNo',
                      filteredCases.map((c) => ({
                        'Mã hồ sơ': c.case_code,
                        'Khách hàng': c.customer?.company_name,
                        'Giá hợp đồng': c.case_financials?.contract_value || 0,
                        'Đã thu': c.case_financials?.paid_amount || 0,
                        'Công nợ còn lại': c.case_financials?.remaining_debt || 0,
                        'Chi phí phát sinh': c.case_financials?.incurred_cost || 0
                      }))
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Xuất Excel
                </Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Mã HS</th>
                      <th className="px-4 py-2.5">Khách hàng</th>
                      <th className="px-4 py-2.5 text-right">Hợp đồng</th>
                      <th className="px-4 py-2.5 text-right">Đã thu</th>
                      <th className="px-4 py-2.5 text-right">Công nợ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCases.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 font-semibold text-primary">{c.case_code}</td>
                        <td className="px-4 py-2.5">{c.customer?.company_name}</td>
                        <td className="px-4 py-2.5 text-right">{formatCurrency(c.case_financials?.contract_value)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700">
                          {formatCurrency(c.case_financials?.paid_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-amber-600 font-semibold">
                          {formatCurrency(c.case_financials?.remaining_debt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="customers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">Lịch sử tiếp nhận khách hàng ({customers.length})</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportExcel(
                    'BaoCao_TiepNhanKhachHang',
                    customers.map((c) => ({
                      'Mã KH': c.customer_code,
                      'Tên doanh nghiệp': c.company_name,
                      'MST': c.tax_code || '',
                      'Loại hình': BUSINESS_TYPE_LABELS[c.business_type],
                      'Phụ trách': c.assigned_staff?.full_name || '',
                      'Ngày tiếp nhận': formatDate(c.created_at)
                    }))
                  )
                }
              >
                <Download className="h-4 w-4" /> Xuất Excel
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Mã KH</th>
                    <th className="px-4 py-2.5">Doanh nghiệp</th>
                    <th className="px-4 py-2.5">MST</th>
                    <th className="px-4 py-2.5">Loại hình</th>
                    <th className="px-4 py-2.5">Phụ trách</th>
                    <th className="px-4 py-2.5">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-semibold">{c.customer_code}</td>
                      <td className="px-4 py-2.5">{c.company_name}</td>
                      <td className="px-4 py-2.5 font-mono">{c.tax_code || '—'}</td>
                      <td className="px-4 py-2.5">{BUSINESS_TYPE_LABELS[c.business_type]}</td>
                      <td className="px-4 py-2.5">{c.assigned_staff?.full_name || '—'}</td>
                      <td className="px-4 py-2.5">{formatDate(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
