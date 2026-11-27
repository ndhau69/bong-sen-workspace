import { KANBAN_STATUS_MAP, PRIORITY_META, STEP_STATUS_META } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { CasePriority, KanbanStatus, StepStatus } from '@/types/database'

export function KanbanStatusBadge({ status }: { status: KanbanStatus }) {
  const meta = KANBAN_STATUS_MAP[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        meta.badgeClass
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} />
      {meta.label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        meta.badgeClass
      )}
    >
      {meta.label}
    </span>
  )
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const meta = STEP_STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        meta.badgeClass
      )}
    >
      {meta.label}
    </span>
  )
}
