import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { AlertCircle, Calendar, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { KANBAN_COLUMNS, formatDate, isOverdue } from '@/lib/formatters'
import { PriorityBadge } from '@/components/common/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { KanbanStatus, Profile, ServiceCase, ServiceItem } from '@/types/database'

function KanbanCard({
  item,
  onOpen,
  onQuickMove
}: {
  item: ServiceCase
  onOpen: (id: string) => void
  onQuickMove: (id: string, status: KanbanStatus) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { currentStatus: item.kanban_status }
  })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const overdue = isOverdue(item.due_date, item.kanban_status)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-xl border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing space-y-2 transition-shadow hover:shadow-md ${
        isDragging ? 'opacity-60 ring-2 ring-primary z-50' : overdue ? 'border-red-300' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpen(item.id)}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {item.case_code}
        </button>
        <PriorityBadge priority={item.priority} />
      </div>

      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onOpen(item.id)}
        className="cursor-pointer space-y-0.5"
      >
        <div className="text-xs font-semibold text-slate-900 line-clamp-2">
          {item.customer?.company_name || 'Khách hàng'}
        </div>
        <div className="text-[11px] text-slate-500 line-clamp-1">{item.service?.name}</div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
        <span className="inline-flex items-center gap-1 truncate max-w-[120px]">
          <User className="h-3 w-3 shrink-0" />
          {item.assigned_staff?.full_name || 'Chưa gán'}
        </span>
        <span
          className={`inline-flex items-center gap-1 shrink-0 ${
            overdue ? 'text-red-600 font-semibold' : 'text-slate-500'
          }`}
        >
          {overdue ? <AlertCircle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
          {formatDate(item.due_date)}
        </span>
      </div>

      {/* Quick move cho thiết bị cảm ứng */}
      <div onPointerDown={(e) => e.stopPropagation()} className="lg:hidden pt-1">
        <Select
          value={item.kanban_status}
          onValueChange={(v) => onQuickMove(item.id, v as KanbanStatus)}
        >
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KANBAN_COLUMNS.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function KanbanColumn({
  col,
  items,
  onOpen,
  onQuickMove
}: {
  col: (typeof KANBAN_COLUMNS)[number]
  items: ServiceCase[]
  onOpen: (id: string) => void
  onQuickMove: (id: string, status: KanbanStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 flex flex-col rounded-xl border transition-colors ${
        isOver ? 'border-primary bg-blue-50/50' : 'border-slate-200 bg-slate-100/70'
      }`}
    >
      <div className="px-3 py-2.5 border-b border-slate-200/80 flex items-center justify-between bg-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${col.dotClass}`} />
          <span className="text-xs font-semibold text-slate-800">{col.label}</span>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          {items.length}
        </span>
      </div>
      <div className="p-2.5 space-y-2.5 min-h-[420px] max-h-[calc(100vh-270px)] overflow-y-auto">
        {items.map((item) => (
          <KanbanCard key={item.id} item={item} onOpen={onOpen} onQuickMove={onQuickMove} />
        ))}
      </div>
    </div>
  )
}

export function KanbanPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const [staffFilter, setStaffFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').eq('is_active', true)
      if (error) throw error
      return data as Pick<Profile, 'id' | 'full_name'>[]
    }
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services-options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('id, name').eq('is_active', true)
      if (error) throw error
      return data as Pick<ServiceItem, 'id' | 'name'>[]
    }
  })

  const { data: cases = [] } = useQuery({
    queryKey: ['kanban-cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cases')
        .select(
          '*, customer:customers(id, company_name), service:services(id, name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(id, full_name)'
        )
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data as unknown as ServiceCase[]
    }
  })

  useEffect(() => {
    const channel = supabase
      .channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_cases' }, () => {
        queryClient.invalidateQueries({ queryKey: ['kanban-cases'] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const moveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: KanbanStatus }) => {
      const { error } = await supabase.from('service_cases').update({ kanban_status: status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái Kanban')
      queryClient.invalidateQueries({ queryKey: ['kanban-cases'] })
      queryClient.invalidateQueries({ queryKey: ['service-cases'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (staffFilter !== 'all' && c.assigned_staff_id !== staffFilter) return false
      if (serviceFilter !== 'all' && c.service_id !== serviceFilter) return false
      if (fromDate && c.received_date < fromDate) return false
      if (toDate && c.received_date > toDate) return false
      return true
    })
  }, [cases, staffFilter, serviceFilter, fromDate, toDate])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const caseId = String(active.id)
    const nextStatus = String(over.id) as KanbanStatus
    const currentStatus = active.data.current?.currentStatus as KanbanStatus | undefined
    if (nextStatus && nextStatus !== currentStatus) {
      moveMutation.mutate({ id: caseId, status: nextStatus })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Bảng Kanban điều phối hồ sơ</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Kéo thả thẻ hồ sơ giữa 8 trạng thái xử lý. Mọi thay đổi được đồng bộ Realtime và ghi Audit Log.
        </p>
      </div>

      {/* Bộ lọc */}
      <Card>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Lọc theo nhân viên" />
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
              <SelectValue placeholder="Lọc theo dịch vụ" />
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

          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            title="Từ ngày tiếp nhận"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            title="Đến ngày tiếp nhận"
          />
        </CardContent>
      </Card>

      {/* Kanban Columns */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              items={filtered.filter((c) => c.kanban_status === col.id)}
              onOpen={(id) => navigate(`/cases/${id}`)}
              onQuickMove={(id, status) => moveMutation.mutate({ id, status })}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
