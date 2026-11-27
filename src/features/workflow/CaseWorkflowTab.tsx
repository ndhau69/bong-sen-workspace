import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Send,
  MessageSquare,
  ListTodo,
  UserCheck
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { STEP_STATUS_META, formatDateTime, isOverdue } from '@/lib/formatters'
import { StepStatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { CaseComment, CaseStep, CaseSubtask, Profile, StepStatus } from '@/types/database'

interface CaseWorkflowTabProps {
  caseId: string
  staffList: Pick<Profile, 'id' | 'full_name' | 'employee_code'>[]
}

export function CaseWorkflowTab({ caseId, staffList }: CaseWorkflowTabProps) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [newSubtaskByStep, setNewSubtaskByStep] = useState<Record<string, string>>({})
  const [commentText, setCommentText] = useState('')
  const [delayModalStep, setDelayModalStep] = useState<CaseStep | null>(null)
  const [delayReason, setDelayReason] = useState('')
  const [addStepOpen, setAddStepOpen] = useState(false)
  const [customStep, setCustomStep] = useState({ title: '', assignee_id: '', due_date: '' })

  const { data: steps = [] } = useQuery({
    queryKey: ['case-steps', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_steps')
        .select('*, assignee:profiles(id, full_name, employee_code)')
        .eq('case_id', caseId)
        .order('step_order')
      if (error) throw error
      return data as CaseStep[]
    }
  })

  const { data: subtasks = [] } = useQuery({
    queryKey: ['case-subtasks', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_subtasks')
        .select('*, assignee:profiles(id, full_name)')
        .eq('case_id', caseId)
        .order('created_at')
      if (error) throw error
      return data as CaseSubtask[]
    }
  })

  const { data: comments = [] } = useQuery({
    queryKey: ['case-comments', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_comments')
        .select('*, author:profiles(id, full_name, role)')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CaseComment[]
    }
  })

  const updateStepMutation = useMutation({
    mutationFn: async (payload: {
      id: string
      status?: StepStatus
      assignee_id?: string | null
      delay_reason?: string | null
      notes?: string | null
    }) => {
      const updates: Record<string, unknown> = {}
      if (payload.status !== undefined) {
        updates.status = payload.status
        if (payload.status === 'in_progress') updates.started_at = new Date().toISOString()
        if (payload.status === 'completed') updates.completed_at = new Date().toISOString()
      }
      if (payload.assignee_id !== undefined) updates.assignee_id = payload.assignee_id
      if (payload.delay_reason !== undefined) updates.delay_reason = payload.delay_reason
      if (payload.notes !== undefined) updates.notes = payload.notes

      const { error } = await supabase.from('case_steps').update(updates).eq('id', payload.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã cập nhật bước xử lý')
      queryClient.invalidateQueries({ queryKey: ['case-steps', caseId] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const addSubtaskMutation = useMutation({
    mutationFn: async ({ stepId, title }: { stepId: string; title: string }) => {
      const { error } = await supabase.from('case_subtasks').insert({
        case_id: caseId,
        step_id: stepId,
        title: title.trim(),
        assignee_id: profile?.id || null
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      setNewSubtaskByStep((prev) => ({ ...prev, [vars.stepId]: '' }))
      queryClient.invalidateQueries({ queryKey: ['case-subtasks', caseId] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ id, is_done }: { id: string; is_done: boolean }) => {
      const { error } = await supabase
        .from('case_subtasks')
        .update({ is_done, completed_at: is_done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-subtasks', caseId] })
    }
  })

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!commentText.trim()) return
      const { error } = await supabase.from('case_comments').insert({
        case_id: caseId,
        author_id: profile!.id,
        content: commentText.trim()
      })
      if (error) throw error
    },
    onSuccess: () => {
      setCommentText('')
      queryClient.invalidateQueries({ queryKey: ['case-comments', caseId] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const addStepMutation = useMutation({
    mutationFn: async () => {
      const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) + 1 : 1
      const { error } = await supabase.from('case_steps').insert({
        case_id: caseId,
        step_order: nextOrder,
        title: customStep.title.trim(),
        assignee_id: customStep.assignee_id || profile?.id || null,
        due_date: customStep.due_date ? new Date(customStep.due_date).toISOString() : null,
        status: 'todo'
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã thêm bước công việc')
      setAddStepOpen(false)
      setCustomStep({ title: '', assignee_id: '', due_date: '' })
      queryClient.invalidateQueries({ queryKey: ['case-steps', caseId] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const completedCount = steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Cột trái: Danh sách các bước Workflow */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-700">
                  Tiến độ quy trình ({completedCount}/{steps.length} bước)
                </span>
                <span className="text-primary">{progressPct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddStepOpen(true)}>
              <Plus className="h-4 w-4" />
              Thêm bước phát sinh
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {steps.map((step) => {
            const overdue = isOverdue(step.due_date, step.status)
            const stepSubtasks = subtasks.filter((st) => st.step_id === step.id)
            return (
              <Card
                key={step.id}
                className={overdue ? 'border-red-300 bg-red-50/20' : undefined}
              >
                <CardContent className="pt-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          step.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : overdue
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-50 text-primary'
                        }`}
                      >
                        {step.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : step.step_order}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{step.title}</div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600 font-semibold' : ''}`}>
                            {overdue ? <AlertTriangle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                            Hạn: {formatDateTime(step.due_date)}
                          </span>
                          {step.completed_at && (
                            <span className="text-emerald-600">
                              Xong: {formatDateTime(step.completed_at)}
                            </span>
                          )}
                        </div>
                        {step.delay_reason && (
                          <div className="mt-1.5 rounded bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-800">
                            <strong>Lý do chậm tiến độ:</strong> {step.delay_reason}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <StepStatusBadge status={step.status} />
                      <Select
                        value={step.status}
                        onValueChange={(v) => {
                          const next = v as StepStatus
                          if ((overdue && next === 'completed') || next === 'blocked') {
                            setDelayModalStep({ ...step, status: next })
                            setDelayReason(step.delay_reason || '')
                          } else {
                            updateStepMutation.mutate({ id: step.id, status: next })
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
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
                    </div>
                  </div>

                  {/* Chuyển giao / Người thực hiện */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-slate-500">Thực hiện:</span>
                      <Select
                        value={step.assignee_id || ''}
                        onValueChange={(v) => updateStepMutation.mutate({ id: step.id, assignee_id: v || null })}
                      >
                        <SelectTrigger className="h-7 w-44 text-xs">
                          <SelectValue placeholder="Chưa phân công" />
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-amber-700"
                      onClick={() => {
                        setDelayModalStep(step)
                        setDelayReason(step.delay_reason || '')
                      }}
                    >
                      Ghi nhận chậm tiến độ
                    </Button>
                  </div>

                  {/* Subtasks */}
                  <div className="bg-slate-50 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      <ListTodo className="h-3.5 w-3.5" />
                      <span>Công việc con ({stepSubtasks.filter((x) => x.is_done).length}/{stepSubtasks.length})</span>
                    </div>
                    {stepSubtasks.map((st) => (
                      <label key={st.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={st.is_done}
                          onChange={(e) => toggleSubtaskMutation.mutate({ id: st.id, is_done: e.target.checked })}
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
                        <span className={st.is_done ? 'line-through text-slate-400' : 'text-slate-700'}>
                          {st.title}
                        </span>
                      </label>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const text = newSubtaskByStep[step.id]
                        if (text?.trim()) addSubtaskMutation.mutate({ stepId: step.id, title: text })
                      }}
                      className="flex gap-1.5"
                    >
                      <Input
                        placeholder="+ Thêm công việc con..."
                        className="h-7 text-xs bg-white"
                        value={newSubtaskByStep[step.id] || ''}
                        onChange={(e) => setNewSubtaskByStep((prev) => ({ ...prev, [step.id]: e.target.value }))}
                      />
                      <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs px-2.5">
                        Thêm
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Cột phải: Trao đổi nội bộ */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Trao đổi nội bộ hồ sơ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addCommentMutation.mutate()
              }}
              className="space-y-2"
            >
              <Textarea
                rows={3}
                placeholder="Nhập ghi chú, cập nhật tình trạng nộp Sở KH&ĐT, nhắc đồng nghiệp..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <Button type="submit" size="sm" className="w-full" disabled={addCommentMutation.isPending}>
                <Send className="h-3.5 w-3.5" />
                Gửi trao đổi
              </Button>
            </form>

            <div className="space-y-2.5 max-h-[500px] overflow-y-auto pt-2 border-t border-slate-100">
              {comments.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-4">Chưa có bình luận nào</div>
              ) : (
                comments.map((cm) => (
                  <div key={cm.id} className="rounded-lg bg-slate-50 p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-900">{cm.author?.full_name || 'Nhân viên'}</span>
                      <span className="text-slate-400">{formatDateTime(cm.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">{cm.content}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal ghi nhận lý do chậm tiến độ */}
      <Dialog open={Boolean(delayModalStep)} onOpenChange={(o) => !o && setDelayModalStep(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi nhận lý do chậm tiến độ / vướng mắc</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!delayModalStep) return
              updateStepMutation.mutate({
                id: delayModalStep.id,
                status: delayModalStep.status,
                delay_reason: delayReason.trim()
              })
              setDelayModalStep(null)
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Lý do cụ thể *</Label>
              <Textarea
                required
                rows={3}
                placeholder="VD: Khách hàng chưa gửi bản sao CCCD công chứng / Sở yêu cầu sửa ngành nghề..."
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDelayModalStep(null)}>
                Hủy
              </Button>
              <Button type="submit">Lưu cập nhật</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal thêm bước phát sinh */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm bước công việc phát sinh</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addStepMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Tên bước *</Label>
              <Input
                required
                placeholder="VD: Nộp giải trình bổ sung lần 2"
                value={customStep.title}
                onChange={(e) => setCustomStep({ ...customStep, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Người thực hiện</Label>
              <Select
                value={customStep.assignee_id}
                onValueChange={(v) => setCustomStep({ ...customStep, assignee_id: v })}
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
              <Label>Deadline</Label>
              <Input
                type="datetime-local"
                value={customStep.due_date}
                onChange={(e) => setCustomStep({ ...customStep, due_date: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddStepOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={addStepMutation.isPending}>
                Thêm bước
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
