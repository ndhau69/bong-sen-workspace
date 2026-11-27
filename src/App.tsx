import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { isSupabaseConfigured } from '@/lib/supabase'
import { SetupRequiredView } from '@/components/common/SetupRequiredView'
import { AuthProvider } from '@/features/auth/AuthContext'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { AppShell } from '@/app/AppShell'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage'
import { CasesPage } from '@/features/cases/CasesPage'
import { CaseDetailPage } from '@/features/cases/CaseDetailPage'
import { TasksPage } from '@/features/workflow/TasksPage'
import { KanbanPage } from '@/features/kanban/KanbanPage'
import { EmployeesPage } from '@/features/employees/EmployeesPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { DocumentsPage } from '@/features/documents/DocumentsPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { UserAccessPage } from '@/features/users/UserAccessPage'
import { PwaInstallPrompt } from '@/pwa/PwaInstallPrompt'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1
    }
  }
})

export default function App() {
  if (!isSupabaseConfigured) {
    return <SetupRequiredView />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <ProtectedRoute screenKey="dashboard">
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers"
                element={
                  <ProtectedRoute screenKey="customers">
                    <CustomersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers/:id"
                element={
                  <ProtectedRoute screenKey="customers">
                    <CustomerDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases"
                element={
                  <ProtectedRoute screenKey="cases">
                    <CasesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cases/:id"
                element={
                  <ProtectedRoute screenKey="cases">
                    <CaseDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <ProtectedRoute screenKey="tasks">
                    <TasksPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/kanban"
                element={
                  <ProtectedRoute screenKey="kanban">
                    <KanbanPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/employees"
                element={
                  <ProtectedRoute screenKey="employees">
                    <EmployeesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'manager', 'accountant']} screenKey="finance">
                    <FinancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents"
                element={
                  <ProtectedRoute screenKey="documents">
                    <DocumentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute screenKey="reports">
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute screenKey="settings">
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/user-access"
                element={
                  <ProtectedRoute allowedRoles={['admin']} screenKey="user_access">
                    <UserAccessPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <PwaInstallPrompt />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  )
}
