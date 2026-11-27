import type { AppRole } from '@/types/database'

export type ScreenKey =
  | 'dashboard'
  | 'customers'
  | 'cases'
  | 'tasks'
  | 'kanban'
  | 'employees'
  | 'finance'
  | 'documents'
  | 'reports'
  | 'settings'
  | 'user_access'

export interface ScreenDefinition {
  key: ScreenKey
  label: string
  path: string
  description: string
}

export const APP_SCREENS: ScreenDefinition[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', description: 'Tổng quan chỉ số & biểu đồ thống kê' },
  { key: 'customers', label: 'Khách hàng', path: '/customers', description: 'Quản lý khách hàng (CRM)' },
  { key: 'cases', label: 'Hồ sơ dịch vụ', path: '/cases', description: 'Danh sách & chi tiết hồ sơ dịch vụ' },
  { key: 'tasks', label: 'Công việc', path: '/tasks', description: 'Danh sách công việc & tiến độ được giao' },
  { key: 'kanban', label: 'Kanban', path: '/kanban', description: 'Bảng kéo thả 8 trạng thái hồ sơ' },
  { key: 'employees', label: 'Nhân viên', path: '/employees', description: 'Danh sách nhân viên & hiệu suất' },
  { key: 'finance', label: 'Tài chính', path: '/finance', description: 'Hợp đồng, thanh toán & công nợ (RLS khóa theo vai trò)' },
  { key: 'documents', label: 'Tài liệu', path: '/documents', description: 'Kho lưu trữ tài liệu & chứng từ' },
  { key: 'reports', label: 'Báo cáo', path: '/reports', description: 'Báo cáo tổng hợp & xuất Excel' },
  { key: 'settings', label: 'Cài đặt', path: '/settings', description: 'Danh mục dịch vụ, quy trình, Audit Log, Google Sheets' },
  { key: 'user_access', label: 'User & Phân quyền', path: '/user-access', description: 'Tạo user, vai trò và phân quyền màn hình Show/Hide' }
]

export const DEFAULT_ROLE_VISIBILITY: Record<AppRole, Record<ScreenKey, boolean>> = {
  admin: {
    dashboard: true,
    customers: true,
    cases: true,
    tasks: true,
    kanban: true,
    employees: true,
    finance: true,
    documents: true,
    reports: true,
    settings: true,
    user_access: true
  },
  manager: {
    dashboard: true,
    customers: true,
    cases: true,
    tasks: true,
    kanban: true,
    employees: true,
    finance: true,
    documents: true,
    reports: true,
    settings: true,
    user_access: false
  },
  staff: {
    dashboard: true,
    customers: true,
    cases: true,
    tasks: true,
    kanban: true,
    employees: false,
    finance: false,
    documents: true,
    reports: true,
    settings: false,
    user_access: false
  },
  accountant: {
    dashboard: true,
    customers: true,
    cases: true,
    tasks: false,
    kanban: false,
    employees: false,
    finance: true,
    documents: true,
    reports: true,
    settings: false,
    user_access: false
  }
}
