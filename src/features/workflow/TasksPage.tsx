import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { STEP_STATUS_META, formatDateTime, isDueSoon, isOverdue } from '@/lib/formatters'
import { StepStatusBadge } from '@/components/common/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { CaseStep, StepStatus } from '@/types/database'

interface StepWithCase extends CaseStep {
  service_case?: {
    id: string
    case_code: string
    procedure_name: string
    customer?: { company_name: string } | null
  } | null
}

export function TasksPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState('')

  const { data: steps = [], isLoading } = useQuery({
    queryKey: ['all-case-steps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_steps')
        .select(
          '*, assignee:profiles(id, full_name, employee_code), service_case:service_cases(id, case_code, procedure_name, customer:customers(company_name))'
        )
        .order('due_date', { ascending: true })
      if (error) throw error
      return data as unknown as StepWithCase[]
    }
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StepStatus }) => {
      const { error } = await supabase
        .from('case_steps')
        .update({
          status,
          completed_at: status === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái công việc')
      queryClient.invalidateQueries({ queryKey: ['all-case-steps'] })
    }
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return steps.filter((s) => {
      if (scope === 'mine' && s.assignee_id !== profile?.id) return false
      if (statusFilter === 'active' && (s.status === 'completed' || s.status === 'skipped')) return false
      if (statusFilter === 'overdue' && !isOverdue(s.due_date, s.status)) return false
      if (statusFilter === 'completed' && s.status !== 'completed') return false
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q) ||
        (s.service_case?.case_code || '').toLowerCase().includes(q) ||
        (s.service_case?.customer?.company_name || '').toLowerCase().includes(q)
      )
    })
  }, [steps, scope, statusFilter, search, profile?.id])

  const myOverdue = steps.filter((s) => s.assignee_id === profile?.id && isOverdue(s.due_date, s.status)).length
  const myDueSoon = steps.filter((s) => s.assignee_id === profile?.id && isDueSoon(s.due_date, s.status)).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản lý Công việc &amp; Tiến độ</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi các bước xử lý được giao, cảnh báo sắp đến hạn và công việc quá hạn.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-amber-800 font-medium">
            <Clock className="h-3.5 w-3.5" /> Sắp đến hạn: {myDueSoon}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-red-700 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Quá hạn: {myOverdue}
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm tên bước, mã hồ sơ, tên khách hàng..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={scope} onValueChange={(v) => setScope(v as 'mine' | 'all')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Việc của tôi</SelectItem>
              <SelectItem value="all">Tất cả nhân sự (theo quyền)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Đang cần xử lý</SelectItem>
              <SelectItem value="overdue">Quá hạn</SelectItem>
              <SelectItem value="completed">Đã hoàn thành</SelectItem>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Danh sách công việc ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-y text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Bước công việc</th>
                <th className="px-4 py-3">Hồ sơ / Khách hàng</th>
                <th className="px-4 py-3">Người thực hiện</th>
                <th className="px-4 py-3">Deadline</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Cập nhật nhanh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Đang tải danh sách công việc...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-emerald-500" />
                    Không có công việc tồn đọng theo bộ lọc hiện tại
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const overdue = isOverdue(s.due_date, s.status)
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          Bước {s.step_order}: {s.title}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => s.service_case && navigate(`/cases/${s.service_case.id}`)}
                          className="text-left hover:underline"
                        >
                          <div className="font-semibold text-primary">{s.service_case?.case_code}</div>
                          <div className="text-slate-600">{s.service_case?.customer?.company_name}</div>
                        </button>
                      </td>
                      <td className="px-4 py-3">{s.assignee?.full_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                          {formatDateTime(s.due_date)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StepStatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Select
                          value={s.status}
                          onValueChange={(v) => updateStatusMutation.mutate({ id: s.id, status: v as StepStatus })}
                        >
                          <SelectTrigger className="h-7 w-36 text-xs ml-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STEP_STATUS_META) as StepStatus[]).map((st) => (
                              <SelectItem key={st} value={st}>
                                {STEP_STATUS_META[st].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
  )
}
