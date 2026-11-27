import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Users,
  Briefcase,
  FolderPlus,
  Hourglass,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Wallet
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import { KANBAN_STATUS_MAP, formatCurrency, isDueSoon, isOverdue } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CasePayment, CaseStep, ServiceCase } from '@/types/database'

const CHART_COLORS = ['#2563EB', '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#64748B', '#EC4899']

export function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const canViewFinance = Permissions.canViewFinance(profile?.role)

  const { data: customerCount = 0 } = useQuery({
    queryKey: ['dashboard-customers-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
      if (error) throw error
      return count || 0
    }
  })

  const { data: cases = [] } = useQuery({
    queryKey: ['dashboard-cases', canViewFinance],
    queryFn: async () => {
      const selectClause = canViewFinance
        ? '*, service:services(name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(full_name), case_financials(*)'
        : '*, service:services(name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(full_name)'
      const { data, error } = await supabase.from('service_cases').select(selectClause)
      if (error) throw error
      return data as unknown as ServiceCase[]
    }
  })

  const { data: steps = [] } = useQuery({
    queryKey: ['dashboard-steps'],
    queryFn: async () => {
      const { data, error } = await supabase.from('case_steps').select('id, status, due_date, assignee_id')
      if (error) throw error
      return data as Pick<CaseStep, 'id' | 'status' | 'due_date' | 'assignee_id'>[]
    }
  })

  const { data: payments = [] } = useQuery({
    queryKey: ['dashboard-payments'],
    enabled: canViewFinance,
    queryFn: async () => {
      const { data, error } = await supabase.from('case_payments').select('amount, payment_date')
      if (error) throw error
      return data as Pick<CasePayment, 'amount' | 'payment_date'>[]
    }
  })

  const stats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const activeCases = cases.filter((c) => !['completed', 'cancelled'].includes(c.kanban_status))
    const newReceived = cases.filter((c) => c.kanban_status === 'new_received')
    const waitingCustomer = cases.filter(
      (c) => c.kanban_status === 'waiting_customer' || c.kanban_status === 'need_supplement'
    )
    const waitingAuthority = cases.filter((c) => c.kanban_status === 'waiting_authority')
    const completed = cases.filter((c) => c.kanban_status === 'completed')
    const overdueCases = cases.filter((c) => isOverdue(c.due_date, c.kanban_status))
    const dueSoonTasks = steps.filter((s) => isDueSoon(s.due_date, s.status))

    const completedSteps = steps.filter((s) => s.status === 'completed').length
    const totalSteps = steps.length
    const completionRate = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

    const monthRevenue = payments
      .filter((p) => p.payment_date.startsWith(currentMonth))
      .reduce((acc, p) => acc + Number(p.amount), 0)

    const totalDebt = cases
      .filter((c) => c.kanban_status !== 'cancelled')
      .reduce((acc, c) => acc + Number(c.case_financials?.remaining_debt || 0), 0)

    return {
      activeCount: activeCases.length,
      newReceivedCount: newReceived.length,
      waitingCustomerCount: waitingCustomer.length,
      waitingAuthorityCount: waitingAuthority.length,
      completedCount: completed.length,
      overdueCount: overdueCases.length,
      dueSoonCount: dueSoonTasks.length,
      completionRate,
      monthRevenue,
      totalDebt
    }
  }, [cases, steps, payments])

  const casesByService = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cases) {
      const name = c.service?.name || 'Khác'
      map.set(name, (map.get(name) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 22) + '…' : name, value }))
      .slice(0, 8)
  }, [cases])

  const casesByStatus = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cases) {
      const label = KANBAN_STATUS_MAP[c.kanban_status].label
      map.set(label, (map.get(label) || 0) + 1)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [cases])

  const casesByStaff = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of cases) {
      const name = c.assigned_staff?.full_name || 'Chưa phân công'
      map.set(name, (map.get(name) || 0) + 1)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [cases])

  const revenueByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments) {
      const m = p.payment_date.slice(0, 7)
      map.set(m, (map.get(m) || 0) + Number(p.amount))
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, total]) => ({ month, total }))
  }, [payments])

  const kpis = [
    { label: 'Tổng khách hàng', value: customerCount, icon: Users, color: 'text-blue-600 bg-blue-50', to: '/customers' },
    { label: 'Hồ sơ đang xử lý', value: stats.activeCount, icon: Briefcase, color: 'text-indigo-600 bg-indigo-50', to: '/cases' },
    { label: 'Mới tiếp nhận', value: stats.newReceivedCount, icon: FolderPlus, color: 'text-sky-600 bg-sky-50', to: '/kanban' },
    { label: 'Chờ KH bổ sung', value: stats.waitingCustomerCount, icon: Hourglass, color: 'text-amber-600 bg-amber-50', to: '/kanban' },
    { label: 'Tại cơ quan nhà nước', value: stats.waitingAuthorityCount, icon: Landmark, color: 'text-violet-600 bg-violet-50', to: '/kanban' },
    { label: 'Đã hoàn thành', value: stats.completedCount, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50', to: '/cases' },
    { label: 'Hồ sơ quá hạn', value: stats.overdueCount, icon: AlertTriangle, color: 'text-red-600 bg-red-50', to: '/cases' },
    { label: 'Việc sắp đến hạn', value: stats.dueSoonCount, icon: Clock, color: 'text-orange-600 bg-orange-50', to: '/tasks' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard Tổng quan</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Xin chào, <strong>{profile?.full_name}</strong> — Hiệu suất hoàn thành bước công việc toàn hệ thống:{' '}
            <span className="font-semibold text-primary">{stats.completionRate}%</span>
          </p>
        </div>
      </div>

      {/* 8 Operational KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {kpis.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.label}
              onClick={() => navigate(item.to)}
              className="cursor-pointer hover:border-blue-300 transition-colors"
            >
              <CardContent className="pt-4 pb-4 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">{item.label}</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{item.value}</div>
                </div>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Finance KPI row (Role restricted) */}
      {canViewFinance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card onClick={() => navigate('/finance')} className="cursor-pointer hover:border-blue-300">
            <CardContent className="pt-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Doanh thu thực thu tháng này</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrency(stats.monthRevenue)}</div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card onClick={() => navigate('/finance')} className="cursor-pointer hover:border-blue-300">
            <CardContent className="pt-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Tổng công nợ khách hàng</div>
                <div className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(stats.totalDebt)}</div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Wallet className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 4 Biểu đồ thống kê */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Hồ sơ theo loại dịch vụ</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={casesByService} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Số hồ sơ" fill="#2563EB" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Hồ sơ theo trạng thái</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={casesByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
                  {casesByStatus.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {canViewFinance && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Doanh thu theo tháng</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                  <Area type="monotone" dataKey="total" name="Thực thu" stroke="#2563EB" fill="#DBEAFE" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Số lượng hồ sơ theo nhân viên</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={casesByStaff}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name="Số hồ sơ" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
