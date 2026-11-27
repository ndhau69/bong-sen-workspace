import type {
  AppRole,
  BusinessType,
  CasePriority,
  KanbanStatus,
  PaymentMethod,
  PaymentType,
  StepStatus
} from '@/types/database'

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '0 ₫'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date)
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function isOverdue(dueDate: string | null | undefined, status?: string): boolean {
  if (!dueDate || status === 'completed' || status === 'cancelled' || status === 'skipped') {
    return false
  }
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

export function isDueSoon(dueDate: string | null | undefined, status?: string, days = 2): boolean {
  if (!dueDate || status === 'completed' || status === 'cancelled' || status === 'skipped') {
    return false
  }
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const limit = new Date(today)
  limit.setDate(limit.getDate() + days)
  return due >= today && due <= limit
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Quản trị viên (Admin)',
  manager: 'Quản lý (Manager)',
  staff: 'Nhân viên nghiệp vụ',
  accountant: 'Kế toán tài chính'
}

export const ROLE_SHORT_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Nhân viên',
  accountant: 'Kế toán'
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  tnhh_1tv: 'Công ty TNHH 1 thành viên',
  tnhh_2tv: 'Công ty TNHH 2 thành viên trở lên',
  co_phan: 'Công ty Cổ phần',
  tu_nhan: 'Doanh nghiệp tư nhân',
  ho_kinh_doanh: 'Hộ kinh doanh',
  other: 'Loại hình khác'
}

export const PRIORITY_META: Record<
  CasePriority,
  { label: string; badgeClass: string }
> = {
  low: { label: 'Thấp', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  medium: { label: 'Trung bình', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  high: { label: 'Cao', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  urgent: { label: 'Khẩn cấp', badgeClass: 'bg-red-50 text-red-700 border-red-200' }
}

export const KANBAN_COLUMNS: Array<{
  id: KanbanStatus
  label: string
  dotClass: string
  badgeClass: string
}> = [
  { id: 'new_received', label: 'Mới tiếp nhận', dotClass: 'bg-sky-500', badgeClass: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'pending', label: 'Chờ xử lý', dotClass: 'bg-slate-500', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'in_progress', label: 'Đang thực hiện', dotClass: 'bg-blue-600', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'waiting_customer', label: 'Chờ khách hàng', dotClass: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'waiting_authority', label: 'Chờ cơ quan nhà nước', dotClass: 'bg-violet-500', badgeClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  { id: 'need_supplement', label: 'Cần bổ sung', dotClass: 'bg-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  { id: 'completed', label: 'Hoàn thành', dotClass: 'bg-emerald-600', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'cancelled', label: 'Đã hủy', dotClass: 'bg-zinc-400', badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
]

export const KANBAN_STATUS_MAP = Object.fromEntries(
  KANBAN_COLUMNS.map((c) => [c.id, c])
) as Record<KanbanStatus, (typeof KANBAN_COLUMNS)[number]>

export const STEP_STATUS_META: Record<StepStatus, { label: string; badgeClass: string }> = {
  todo: { label: 'Chưa làm', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'Đang thực hiện', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  waiting: { label: 'Đang chờ', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  blocked: { label: 'Bị vướng / Chậm', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
  completed: { label: 'Hoàn thành', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  skipped: { label: 'Bỏ qua', badgeClass: 'bg-zinc-100 text-zinc-500 border-zinc-200' }
}

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Đặt cọc',
  installment: 'Thanh toán đợt',
  final: 'Tất toán'
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  card: 'Thẻ',
  other: 'Khác'
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
