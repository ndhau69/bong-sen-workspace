import type { AppRole } from '@/types/database'

export const Permissions = {
  canManageEmployees(role?: AppRole | null): boolean {
    return role === 'admin'
  },
  canViewEmployees(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'manager'
  },
  canManageCatalog(role?: AppRole | null): boolean {
    return role === 'admin'
  },
  canConfigureWorkflow(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'manager'
  },
  canViewAllCustomersAndCases(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'manager' || role === 'accountant'
  },
  canCreateCaseOrCustomer(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'manager' || role === 'staff'
  },
  canAssignCases(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'manager'
  },
  canViewFinance(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'manager' || role === 'accountant'
  },
  canRecordPayments(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'accountant'
  },
  canViewAuditLogs(role?: AppRole | null): boolean {
    return role === 'admin' || role === 'manager'
  },
  canDeleteCompletedCase(): boolean {
    return false
  }
}
