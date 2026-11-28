import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Briefcase, CheckSquare, Files, MapPin, Phone, Mail, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BUSINESS_TYPE_LABELS, formatDate } from '@/lib/formatters'
import { KanbanStatusBadge, PriorityBadge, StepStatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { CaseDocument, CaseStep, Customer, CustomerColumnConfig, ServiceCase } from '@/types/database'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*, assigned_staff:profiles!customers_assigned_staff_id_fkey(id, full_name, employee_code)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Customer
    }
  })

  const { data: customColumns = [] } = useQuery({
    queryKey: ['customer-custom-columns-detail'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_column_configs')
        .select('*')
        .eq('is_system', false)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as CustomerColumnConfig[]
    }
  })

  const { data: cases = [] } = useQuery({
    queryKey: ['customer-cases', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cases')
        .select('*, service:services(id, code, name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(id, full_name)')
        .eq('customer_id', id!)
        .order('received_date', { ascending: false })
      if (error) throw error
      return data as ServiceCase[]
    }
  })

  const { data: relatedSteps = [] } = useQuery({
    queryKey: ['customer-steps', id, cases.length],
    enabled: cases.length > 0,
    queryFn: async () => {
      const caseIds = cases.map((c) => c.id)
      const { data, error } = await supabase
        .from('case_steps')
        .select('*, assignee:profiles(id, full_name)')
        .in('case_id', caseIds)
        .order('due_date', { ascending: true })
      if (error) throw error
      return data as CaseStep[]
    }
  })

  const { data: documents = [] } = useQuery({
    queryKey: ['customer-documents', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, uploader:profiles(id, full_name)')
        .eq('customer_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as CaseDocument[]
    }
  })

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-slate-400">Đang tải hồ sơ khách hàng...</div>
  }

  if (!customer) {
    return <div className="p-8 text-center text-sm text-slate-500">Không tìm thấy khách hàng.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/customers')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{customer.company_name}</h1>
              {customer.sheet_no && <Badge variant="secondary">No. {customer.sheet_no}</Badge>}
              <Badge variant="outline">{customer.customer_code}</Badge>
              {customer.operating_status && (
                <Badge
                  variant="outline"
                  className={
                    customer.operating_status.toLowerCase().includes('ngưng')
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }
                >
                  {customer.operating_status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              MST: <span className="font-mono font-semibold">{customer.tax_code || '—'}</span> •{' '}
              Số định danh: <span className="font-mono font-semibold">{customer.identity_number || '—'}</span> •{' '}
              PIC: <span className="font-semibold text-slate-700">{customer.pic_name || '—'}</span>
            </p>
          </div>
        </div>
        <Button onClick={() => navigate(`/cases?newForCustomer=${customer.id}`)}>
          <Briefcase className="h-4 w-4" />
          Tạo hồ sơ dịch vụ mới
        </Button>
      </div>

      {/* Thông tin tổng quan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Thông tin pháp lý &amp; Liên hệ</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">Chủ DN / Đại diện PL:</span>
              <div className="font-semibold text-slate-900 mt-0.5">{customer.legal_representative || '—'}</div>
            </div>
            <div>
              <span className="text-slate-400">PIC phụ trách:</span>
              <div className="font-semibold text-slate-900 mt-0.5">
                {customer.pic_name || customer.assigned_staff?.full_name || 'Chưa phân công'}
              </div>
            </div>
            <div>
              <span className="text-slate-400">Số định danh (CCCD):</span>
              <div className="font-mono font-semibold text-slate-900 mt-0.5">{customer.identity_number || '—'}</div>
            </div>
            <div>
              <span className="text-slate-400">Loại hình DN:</span>
              <div className="font-medium text-slate-900 mt-0.5">{BUSINESS_TYPE_LABELS[customer.business_type]}</div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              <span>{customer.phone || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span>{customer.email || '—'}</span>
            </div>
            <div className="sm:col-span-2 flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{customer.headquarters_address || 'Chưa cập nhật địa chỉ'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Thành lập: {formatDate(customer.established_date)}</span>
            </div>
            <div>
              <span className="text-slate-400">Ngành nghề:</span>{' '}
              <span className="text-slate-800">{customer.business_lines || '—'}</span>
            </div>
            {customColumns.map((col) => (
              <div key={col.id}>
                <span className="text-slate-400">{col.label}:</span>{' '}
                <span className="text-slate-800 font-medium">
                  {customer.custom_fields?.[col.column_key] || '—'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Ghi chú khách hàng</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 whitespace-pre-wrap">
            {customer.notes || 'Chưa có ghi chú.'}
          </CardContent>
        </Card>
      </div>

      {/* Tabs Lịch sử dịch vụ, Công việc, Tài liệu */}
      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">
            <Briefcase className="h-4 w-4 mr-1.5" />
            Lịch sử hồ sơ ({cases.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <CheckSquare className="h-4 w-4 mr-1.5" />
            Công việc liên quan ({relatedSteps.length})
          </TabsTrigger>
          <TabsTrigger value="documents">
            <Files className="h-4 w-4 mr-1.5" />
            Tài liệu đính kèm ({documents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Mã hồ sơ</th>
                    <th className="px-4 py-3">Dịch vụ / Thủ tục</th>
                    <th className="px-4 py-3">Phụ trách</th>
                    <th className="px-4 py-3">Ngày nhận</th>
                    <th className="px-4 py-3">Hạn xử lý</th>
                    <th className="px-4 py-3">Ưu tiên</th>
                    <th className="px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                        Khách hàng chưa có hồ sơ dịch vụ nào
                      </td>
                    </tr>
                  ) : (
                    cases.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => navigate(`/cases/${c.id}`)}
                      >
                        <td className="px-4 py-3 font-semibold text-primary">{c.case_code}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{c.procedure_name}</div>
                          <div className="text-slate-500">{c.service?.name}</div>
                        </td>
                        <td className="px-4 py-3">{c.assigned_staff?.full_name || '—'}</td>
                        <td className="px-4 py-3">{formatDate(c.received_date)}</td>
                        <td className="px-4 py-3">{formatDate(c.due_date)}</td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={c.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <KanbanStatusBadge status={c.kanban_status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Bước xử lý</th>
                    <th className="px-4 py-3">Người thực hiện</th>
                    <th className="px-4 py-3">Deadline</th>
                    <th className="px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {relatedSteps.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => navigate(`/cases/${s.case_id}`)}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        Bước {s.step_order}: {s.title}
                      </td>
                      <td className="px-4 py-2.5">{s.assignee?.full_name || '—'}</td>
                      <td className="px-4 py-2.5">{formatDate(s.due_date)}</td>
                      <td className="px-4 py-2.5">
                        <StepStatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardContent className="pt-4">
              {documents.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  Chưa có tài liệu đính kèm. Vào mục Tài liệu hoặc chi tiết Hồ sơ để upload.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {documents.map((doc) => (
                    <div key={doc.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-slate-900">{doc.file_name}</div>
                        <div className="text-slate-400">
                          Upload bởi {doc.uploader?.full_name || '—'} • {formatDate(doc.created_at)}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => navigate('/documents')}>
                        Mở kho tài liệu
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
