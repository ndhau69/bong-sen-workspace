import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface SyncLogRow {
  id: string
  target: string
  status: 'success' | 'failed'
  customers_count: number
  cases_count: number
  error_message: string | null
  created_at: string
  actor?: { full_name: string } | null
}

export function GoogleSheetsSyncTab() {
  const queryClient = useQueryClient()

  const { data: logs = [] } = useQuery({
    queryKey: ['integration-sync-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_sync_logs')
        .select('*, actor:profiles(full_name)')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as SyncLogRow[]
    }
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-google-sheets', { body: {} })
      if (error) throw new Error(error.message || 'Không gọi được Edge Function sync-google-sheets')
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: (data) => {
      toast.success(`Đã đồng bộ ${data?.customers || 0} khách hàng & ${data?.cases || 0} hồ sơ sang Google Sheets`)
      queryClient.invalidateQueries({ queryKey: ['integration-sync-logs'] })
    },
    onError: (err: Error) => toast.error(err.message)
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Đồng bộ 1 chiều Supabase → Google Sheets
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Đẩy dữ liệu tổng hợp Khách hàng, Hồ sơ dịch vụ và Tài chính công nợ sang file Google Sheets báo cáo của công ty.
            </p>
          </div>
          <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Đang đồng bộ...' : 'Đồng bộ sang Google Sheets ngay'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-slate-600">
          <div className="rounded-lg bg-blue-50/70 border border-blue-200 p-3 space-y-1.5">
            <div className="font-semibold text-blue-900">Thiết lập nhanh Google Apps Script (miễn phí 100%):</div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Mở file Google Sheets báo cáo → <strong>Tiện ích mở rộng → Apps Script</strong>.</li>
              <li>
                Dán nội dung file <code className="bg-white px-1 rounded">docs/google-apps-script-sync.gs</code> và đặt{' '}
                <code className="bg-white px-1 rounded">SYNC_SECRET</code>.
              </li>
              <li>
                Triển khai dưới dạng <strong>Web App</strong>, lấy URL rồi lưu vào Supabase Secrets:{' '}
                <code className="bg-white px-1 rounded">GOOGLE_SHEETS_WEBHOOK_URL</code> và{' '}
                <code className="bg-white px-1 rounded">GOOGLE_SHEETS_SYNC_SECRET</code>.
              </li>
              <li>
                Deploy Edge Function: <code className="bg-white px-1 rounded">supabase functions deploy sync-google-sheets</code>.
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Lịch sử đồng bộ gần đây</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-y text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2.5">Thời gian</th>
                <th className="px-4 py-2.5">Người kích hoạt</th>
                <th className="px-4 py-2.5">Trạng thái</th>
                <th className="px-4 py-2.5 text-center">Khách hàng</th>
                <th className="px-4 py-2.5 text-center">Hồ sơ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Chưa có lịch sử đồng bộ nào
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 text-slate-500">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium">{log.actor?.full_name || 'Tự động'}</td>
                    <td className="px-4 py-2.5">
                      {log.status === 'success' ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Thành công
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" /> Lỗi
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">{log.customers_count}</td>
                    <td className="px-4 py-2.5 text-center">{log.cases_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
