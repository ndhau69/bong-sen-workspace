import { BUSINESS_TYPE_LABELS, formatDate } from '@/lib/formatters'
import type { Customer, CustomerColumnConfig, CustomerFieldType } from '@/types/database'

export const FIELD_TYPE_LABELS: Record<CustomerFieldType, string> = {
  text: 'Văn bản ngắn',
  textarea: 'Ghi chú dài',
  select: 'Droplist tùy chọn',
  phone: 'Số điện thoại',
  email: 'Email',
  number: 'Số',
  date: 'Ngày tháng'
}

export const DEFAULT_OPERATING_STATUSES = ['Đang hoạt động', 'Ngưng hoạt động', 'Tạm ngưng']

export const PIC_COLOR_PALETTE = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#475569'
]

export const SYSTEM_COLUMN_KEYS = new Set([
  'sheet_no',
  'company_name',
  'identity_number',
  'tax_code',
  'pic_name',
  'operating_status',
  'legal_representative',
  'phone',
  'headquarters_address',
  'notes',
  'email',
  'business_type',
  'business_lines',
  'established_date',
  'customer_code'
])

/**
 * Fallback column definitions in case DB configs have not loaded yet.
 */
export const FALLBACK_COLUMNS: CustomerColumnConfig[] = [
  { id: 'f-1', column_key: 'sheet_no', label: 'No.', field_type: 'text', is_system: true, is_visible: true, sort_order: 1, options: [], created_at: '', updated_at: '' },
  { id: 'f-2', column_key: 'company_name', label: 'Doanh nghiệp', field_type: 'text', is_system: true, is_visible: true, sort_order: 2, options: [], created_at: '', updated_at: '' },
  { id: 'f-3', column_key: 'identity_number', label: 'Số định danh', field_type: 'text', is_system: true, is_visible: true, sort_order: 3, options: [], created_at: '', updated_at: '' },
  { id: 'f-4', column_key: 'tax_code', label: 'MST', field_type: 'text', is_system: true, is_visible: true, sort_order: 4, options: [], created_at: '', updated_at: '' },
  { id: 'f-5', column_key: 'pic_name', label: 'PIC', field_type: 'select', is_system: true, is_visible: true, sort_order: 5, options: [], created_at: '', updated_at: '' },
  { id: 'f-6', column_key: 'operating_status', label: 'Trạng thái', field_type: 'select', is_system: true, is_visible: true, sort_order: 6, options: DEFAULT_OPERATING_STATUSES, created_at: '', updated_at: '' },
  { id: 'f-7', column_key: 'legal_representative', label: 'Chủ DN', field_type: 'text', is_system: true, is_visible: true, sort_order: 7, options: [], created_at: '', updated_at: '' },
  { id: 'f-8', column_key: 'phone', label: 'SĐT', field_type: 'phone', is_system: true, is_visible: true, sort_order: 8, options: [], created_at: '', updated_at: '' }
]

/**
 * Read display/raw value of a customer field regardless of whether it is a built-in column or custom_fields key.
 */
export function getCustomerRawValue(c: Customer, columnKey: string): string {
  switch (columnKey) {
    case 'sheet_no':
      return c.sheet_no || ''
    case 'company_name':
      return c.company_name || ''
    case 'identity_number':
      return c.identity_number || ''
    case 'tax_code':
      return c.tax_code || ''
    case 'pic_name':
      return c.pic_name || ''
    case 'operating_status':
      return c.operating_status || ''
    case 'legal_representative':
      return c.legal_representative || ''
    case 'phone':
      return c.phone || ''
    case 'headquarters_address':
      return c.headquarters_address || ''
    case 'notes':
      return c.notes || ''
    case 'email':
      return c.email || ''
    case 'business_type':
      return c.business_type || 'tnhh_1tv'
    case 'business_lines':
      return c.business_lines || ''
    case 'established_date':
      return c.established_date || ''
    case 'customer_code':
      return c.customer_code || ''
    default:
      return c.custom_fields?.[columnKey] || ''
  }
}

export function getCustomerDisplayValue(c: Customer, col: CustomerColumnConfig): string {
  const raw = getCustomerRawValue(c, col.column_key)
  if (!raw) return ''
  if (col.column_key === 'business_type') {
    return BUSINESS_TYPE_LABELS[c.business_type] || raw
  }
  if (col.field_type === 'date') {
    return formatDate(raw)
  }
  return raw
}

export function toCustomColumnKey(label: string): string {
  const ascii = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `custom_${ascii || 'col'}_${suffix}`
}

export function sortBySheetNo(a: Customer, b: Customer): number {
  const numA = a.sheet_no && /^\d+$/.test(a.sheet_no.trim()) ? Number(a.sheet_no.trim()) : Number.POSITIVE_INFINITY
  const numB = b.sheet_no && /^\d+$/.test(b.sheet_no.trim()) ? Number(b.sheet_no.trim()) : Number.POSITIVE_INFINITY
  if (numA !== numB) return numA - numB
  return a.company_name.localeCompare(b.company_name, 'vi')
}
