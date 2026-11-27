export type AppRole = 'admin' | 'manager' | 'staff' | 'accountant'

export type BusinessType =
  | 'tnhh_1tv'
  | 'tnhh_2tv'
  | 'co_phan'
  | 'tu_nhan'
  | 'ho_kinh_doanh'
  | 'other'

export type CasePriority = 'low' | 'medium' | 'high' | 'urgent'

export type KanbanStatus =
  | 'new_received'
  | 'pending'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_authority'
  | 'need_supplement'
  | 'completed'
  | 'cancelled'

export type StepStatus =
  | 'todo'
  | 'in_progress'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'skipped'

export type PaymentType = 'deposit' | 'installment' | 'final'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other'
export type DocumentAccessScope = 'case_team' | 'managers_only' | 'all_staff' | 'finance'

export type NotificationType =
  | 'task_assigned'
  | 'deadline_soon'
  | 'overdue'
  | 'status_changed'
  | 'supplement_required'
  | 'case_completed'
  | 'comment_mention'

export interface Department {
  id: string
  code: string
  name: string
  description: string | null
  created_at: string
}

export interface Profile {
  id: string
  employee_code: string | null
  full_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  role: AppRole
  department_id: string | null
  job_title: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  department?: Department | null
}

export interface Customer {
  id: string
  customer_code: string
  company_name: string
  tax_code: string | null
  business_type: BusinessType
  legal_representative: string | null
  phone: string | null
  email: string | null
  headquarters_address: string | null
  business_lines: string | null
  established_date: string | null
  assigned_staff_id: string | null
  notes: string | null
  deleted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  assigned_staff?: Pick<Profile, 'id' | 'full_name' | 'employee_code'> | null
}

export interface ServiceCategory {
  id: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
}

export interface ServiceItem {
  id: string
  category_id: string
  code: string
  name: string
  description: string | null
  default_price: number
  default_duration_days: number
  is_active: boolean
  category?: ServiceCategory | null
}

export interface WorkflowTemplate {
  id: string
  service_id: string
  name: string
  description: string | null
  is_active: boolean
  updated_at: string
}

export interface WorkflowTemplateStep {
  id: string
  template_id: string
  step_order: number
  title: string
  description: string | null
  default_duration_hours: number
  default_role: AppRole
  is_required: boolean
}

export interface CaseFinancial {
  case_id: string
  contract_value: number
  incurred_cost: number
  paid_amount: number
  remaining_debt: number
  updated_at: string
}

export interface ServiceCase {
  id: string
  case_code: string
  customer_id: string
  service_id: string
  procedure_name: string
  received_date: string
  due_date: string | null
  completed_at: string | null
  assigned_staff_id: string | null
  priority: CasePriority
  kanban_status: KanbanStatus
  kanban_order: number
  delay_reason: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  customer?: Pick<Customer, 'id' | 'customer_code' | 'company_name' | 'tax_code' | 'phone'> | null
  service?: Pick<ServiceItem, 'id' | 'code' | 'name' | 'category_id'> | null
  assigned_staff?: Pick<Profile, 'id' | 'full_name' | 'employee_code'> | null
  case_financials?: CaseFinancial | null
}

export interface CaseStep {
  id: string
  case_id: string
  step_order: number
  title: string
  description: string | null
  assignee_id: string | null
  started_at: string | null
  due_date: string | null
  completed_at: string | null
  status: StepStatus
  delay_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  assignee?: Pick<Profile, 'id' | 'full_name' | 'employee_code'> | null
}

export interface CaseSubtask {
  id: string
  case_id: string
  step_id: string
  title: string
  assignee_id: string | null
  due_date: string | null
  is_done: boolean
  completed_at: string | null
  created_at: string
  assignee?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface CaseComment {
  id: string
  case_id: string
  step_id: string | null
  author_id: string
  content: string
  mentions: string[]
  created_at: string
  author?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
}

export interface CasePayment {
  id: string
  case_id: string
  payment_type: PaymentType
  amount: number
  payment_date: string
  payment_method: PaymentMethod
  reference_no: string | null
  recorded_by: string | null
  notes: string | null
  created_at: string
}

export interface CaseExpense {
  id: string
  case_id: string
  title: string
  amount: number
  expense_date: string
  is_reimbursable: boolean
  recorded_by: string | null
  notes: string | null
  created_at: string
}

export interface DocumentFolder {
  id: string
  customer_id: string
  case_id: string | null
  parent_id: string | null
  name: string
  created_at: string
}

export interface CaseDocument {
  id: string
  customer_id: string
  case_id: string | null
  step_id: string | null
  folder_id: string | null
  file_name: string
  storage_path: string
  mime_type: string | null
  file_size: number
  version: number
  access_scope: DocumentAccessScope
  uploaded_by: string | null
  created_at: string
  updated_at: string
  uploader?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface AppNotification {
  id: string
  recipient_id: string
  type: NotificationType
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string | null
  entity_table: string
  entity_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRANSFER' | 'STATUS_CHANGE' | 'DOWNLOAD'
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  reason: string | null
  created_at: string
  actor?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}
