import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, Download, Link as LinkIcon, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { BusinessType } from '@/types/database'

interface ParsedCustomerRow {
  company_name: string
  tax_code: string | null
  business_type: BusinessType
  legal_representative: string | null
  phone: string | null
  email: string | null
  headquarters_address: string | null
  business_lines: string | null
  notes: string | null
}

function normalizeBusinessType(raw: unknown): BusinessType {
  const val = String(raw || '').toLowerCase().trim()
  if (val.includes('1tv') || val.includes('1 thành viên') || val.includes('một thành viên')) return 'tnhh_1tv'
  if (val.includes('2tv') || val.includes('2 thành viên') || val.includes('hai thành viên')) return 'tnhh_2tv'
  if (val.includes('cổ phần') || val.includes('co_phan') || val.includes('cp')) return 'co_phan'
  if (val.includes('tư nhân') || val.includes('tu_nhan') || val.includes('dntn')) return 'tu_nhan'
  if (val.includes('hộ') || val.includes('hkd') || val.includes('kinh doanh')) return 'ho_kinh_doanh'
  return 'other'
}

function mapRawRow(row: Record<string, unknown>): ParsedCustomerRow | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const foundKey = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase())
      if (foundKey && row[foundKey] !== undefined && String(row[foundKey]).trim() !== '') {
        return String(row[foundKey]).trim()
      }
    }
    return null
  }

  const companyName = get('Tên doanh nghiệp', 'Ten doanh nghiep', 'company_name', 'Tên công ty', 'Khách hàng')
  if (!companyName) return null

  return {
    company_name: companyName,
    tax_code: get('Mã số thuế', 'Ma so thue', 'MST', 'tax_code'),
    business_type: normalizeBusinessType(get('Loại hình', 'Loai hinh', 'business_type')),
    legal_representative: get('Người đại diện', 'Nguoi dai dien', 'Đại diện PL', 'legal_representative'),
    phone: get('Số điện thoại', 'So dien thoai', 'SĐT', 'SDT', 'phone'),
    email: get('Email', 'email'),
    headquarters_address: get('Địa chỉ', 'Dia chi', 'Địa chỉ trụ sở', 'headquarters_address'),
    business_lines: get('Ngành nghề', 'Nganh nghe', 'business_lines'),
    notes: get('Ghi chú', 'Ghi chu', 'notes')
  }
}

function toGoogleSheetCsvUrl(url: string): string | null {
  const match = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return null
  const sheetId = match[1]
  const gidMatch = url.match(/gid=([0-9]+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
}

export function ImportCustomersDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const [sheetUrl, setSheetUrl] = useState('')
  const [fetchingSheet, setFetchingSheet] = useState(false)
  const [parsedRows, setParsedRows] = useState<ParsedCustomerRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const parseWorkbook = (wb: XLSX.WorkBook) => {
    const firstSheet = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })
    const mapped = json.map(mapRawRow).filter((r): r is ParsedCustomerRow => r !== null)
    if (mapped.length === 0) {
      setParseError('Không tìm thấy dữ liệu hợp lệ. Cần có cột "Tên doanh nghiệp".')
      setParsedRows([])
      return
    }
    setParseError(null)
    setParsedRows(mapped)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      parseWorkbook(wb)
    } catch {
      setParseError('Không đọc được tệp Excel/CSV. Vui lòng kiểm tra định dạng.')
    } finally {
      e.target.value = ''
    }
  }

  const handleFetchGoogleSheet = async () => {
    const csvUrl = toGoogleSheetCsvUrl(sheetUrl.trim())
    if (!csvUrl) {
      setParseError('Link Google Sheet không hợp lệ. Ví dụ: https://docs.google.com/spreadsheets/d/...')
      return
    }
    setFetchingSheet(true)
    setParseError(null)
    try {
      const res = await fetch(csvUrl)
      if (!res.ok) {
        throw new Error('Không tải được Google Sheet. Hãy đảm bảo Sheet đang bật quyền "Bất kỳ ai có đường liên kết đều xem được".')
      }
      const csvText = await res.text()
      const wb = XLSX.read(csvText, { type: 'string' })
      parseWorkbook(wb)
    } catch (err) {
      setParseError((err as Error).message)
    } finally {
      setFetchingSheet(false)
    }
  }

  const downloadTemplate = () => {
    const sample = [
      {
        'Tên doanh nghiệp': 'Công ty TNHH Thương Mại Mẫu',
        'Mã số thuế': '0402199999',
        'Loại hình': 'TNHH 1 thành viên',
        'Người đại diện': 'Nguyễn Văn A',
        'Số điện thoại': '0905123456',
        Email: 'lienhe@congtymau.vn',
        'Địa chỉ trụ sở': '100 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
        'Ngành nghề': 'Thương mại dịch vụ',
        'Ghi chú': 'Import từ Excel'
      }
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'KhachHang')
    XLSX.writeFile(wb, 'Mau_Import_KhachHang_BongSen.xlsx')
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (parsedRows.length === 0) return { inserted: 0 }
      const withTax = parsedRows
        .filter((r) => Boolean(r.tax_code))
        .map((r) => ({
          ...r,
          customer_code: '',
          assigned_staff_id: profile?.id || null,
          created_by: profile?.id || null
        }))

      const withoutTax = parsedRows
        .filter((r) => !r.tax_code)
        .map((r) => ({
          ...r,
          customer_code: '',
          assigned_staff_id: profile?.id || null,
          created_by: profile?.id || null
        }))

      if (withTax.length > 0) {
        const { error } = await supabase
          .from('customers')
          .upsert(withTax, { onConflict: 'tax_code', ignoreDuplicates: true })
        if (error) throw error
      }

      if (withoutTax.length > 0) {
        const { error } = await supabase.from('customers').insert(withoutTax)
        if (error) throw error
      }

      return { inserted: parsedRows.length }
    },
    onSuccess: (res) => {
      toast.success(`Đã import ${res?.inserted || 0} khách hàng vào hệ thống (bỏ qua MST trùng nếu có)`)
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setParsedRows([])
      setSheetUrl('')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Khách hàng từ Excel / Google Sheets
          </DialogTitle>
          <DialogDescription>
            Tải file mẫu Excel hoặc dán link Google Sheets (chế độ chia sẻ công khai chỉ đọc) để nhập hàng loạt vào PostgreSQL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="text-xs text-slate-600">
              Cột bắt buộc: <strong>Tên doanh nghiệp</strong>. Các cột khác: Mã số thuế, Loại hình, Người đại diện, Số điện thoại, Email, Địa chỉ trụ sở, Ngành nghề, Ghi chú.
            </div>
            <Button type="button" size="sm" variant="outline" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" /> Tải file mẫu (.xlsx)
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <Label className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-primary" /> Cách 1: Chọn file Excel / CSV
              </Label>
              <Input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <Label className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5 text-primary" /> Cách 2: Dán link Google Sheets
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={fetchingSheet || !sheetUrl.trim()}
                  onClick={handleFetchGoogleSheet}
                >
                  {fetchingSheet ? 'Đang tải...' : 'Đọc Sheet'}
                </Button>
              </div>
            </div>
          </div>

          {parseError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Đã nhận diện {parsedRows.length} khách hàng hợp lệ (xem trước tối đa 50 dòng):</span>
              </div>
              <div className="max-h-60 overflow-auto border rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Tên doanh nghiệp</th>
                      <th className="px-3 py-2">MST</th>
                      <th className="px-3 py-2">SĐT</th>
                      <th className="px-3 py-2">Đại diện</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 50).map((r, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5 text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-900">{r.company_name}</td>
                        <td className="px-3 py-1.5 font-mono">{r.tax_code || '—'}</td>
                        <td className="px-3 py-1.5">{r.phone || '—'}</td>
                        <td className="px-3 py-1.5">{r.legal_representative || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            type="button"
            disabled={parsedRows.length === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? 'Đang nhập dữ liệu...' : `Import ${parsedRows.length} khách hàng`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
