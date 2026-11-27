import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Upload, Search, Eye, Download, Folder, FileText, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthContext'
import { Permissions } from '@/lib/permissions'
import { formatDateTime, formatFileSize } from '@/lib/formatters'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import type {
  CaseDocument,
  Customer,
  DocumentAccessScope,
  DocumentFolder,
  ServiceCase
} from '@/types/database'

interface DocExtended extends CaseDocument {
  customer?: { company_name: string } | null
  service_case?: { case_code: string } | null
}

export function DocumentsPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const canDelete = Permissions.canConfigureWorkflow(profile?.role)

  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [folderFilter, setFolderFilter] = useState('all')

  const [folderOpen, setFolderOpen] = useState(false)
  const [folderForm, setFolderForm] = useState({ customer_id: '', case_id: '', name: '' })

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    customer_id: '',
    case_id: '',
    folder_id: '',
    access_scope: 'case_team' as DocumentAccessScope
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const [previewDoc, setPreviewDoc] = useState<{ doc: DocExtended; url: string } | null>(null)

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_code, company_name')
        .is('deleted_at', null)
        .order('company_name')
      if (error) throw error
      return data as Pick<Customer, 'id' | 'customer_code' | 'company_name'>[]
    }
  })

  const { data: cases = [] } = useQuery({
    queryKey: ['cases-options-docs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cases')
        .select('id, case_code, customer_id, procedure_name')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Pick<ServiceCase, 'id' | 'case_code' | 'customer_id' | 'procedure_name'>[]
    }
  })

  const { data: folders = [] } = useQuery({
    queryKey: ['document-folders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_folders').select('*').order('name')
      if (error) throw error
      return data as DocumentFolder[]
    }
  })

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['all-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(
          '*, uploader:profiles(id, full_name), customer:customers(company_name), service_case:service_cases(case_code)'
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as DocExtended[]
    }
  })

  const createFolderMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('document_folders').insert({
        customer_id: folderForm.customer_id,
        case_id: folderForm.case_id || null,
        name: folderForm.name.trim(),
        created_by: profile?.id
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã tạo thư mục tài liệu')
      setFolderOpen(false)
      setFolderForm({ customer_id: '', case_id: '', name: '' })
      queryClient.invalidateQueries({ queryKey: ['document-folders'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !uploadForm.customer_id) return
    setUploading(true)
    try {
      const safeName = `${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const storagePath = `${uploadForm.customer_id}/${uploadForm.case_id || 'general'}/${safeName}`

      const { error: upErr } = await supabase.storage.from('case-documents').upload(storagePath, selectedFile)
      if (upErr) throw upErr

      const { error: dbErr } = await supabase.from('documents').insert({
        customer_id: uploadForm.customer_id,
        case_id: uploadForm.case_id || null,
        folder_id: uploadForm.folder_id || null,
        file_name: selectedFile.name,
        storage_path: storagePath,
        mime_type: selectedFile.type,
        file_size: selectedFile.size,
        access_scope: uploadForm.access_scope,
        uploaded_by: profile?.id
      })
      if (dbErr) throw dbErr

      toast.success('Upload tài liệu thành công')
      setUploadOpen(false)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['all-documents'] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const deleteDocMutation = useMutation({
    mutationFn: async (doc: DocExtended) => {
      await supabase.storage.from('case-documents').remove([doc.storage_path])
      const { error } = await supabase.from('documents').delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã xóa tài liệu')
      queryClient.invalidateQueries({ queryKey: ['all-documents'] })
    },
    onError: (e: Error) => toast.error(e.message)
  })

  const openPreview = async (doc: DocExtended, download = false) => {
    const { data, error } = await supabase.storage
      .from('case-documents')
      .createSignedUrl(doc.storage_path, 120, download ? { download: doc.file_name } : undefined)
    if (error || !data?.signedUrl) {
      toast.error('Không thể mở tài liệu')
      return
    }
    if (download) {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      return
    }
    const isPreviewable =
      doc.mime_type?.startsWith('image/') || doc.mime_type === 'application/pdf'
    if (isPreviewable) {
      setPreviewDoc({ doc, url: data.signedUrl })
    } else {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return documents.filter((d) => {
      if (customerFilter !== 'all' && d.customer_id !== customerFilter) return false
      if (folderFilter !== 'all' && d.folder_id !== folderFilter) return false
      if (!q) return true
      return (
        d.file_name.toLowerCase().includes(q) ||
        (d.customer?.company_name || '').toLowerCase().includes(q) ||
        (d.service_case?.case_code || '').toLowerCase().includes(q)
      )
    })
  }, [documents, search, customerFilter, folderFilter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kho Tài liệu &amp; Chứng từ</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Lưu trữ tập trung PDF, Word, Excel, hình ảnh theo khách hàng và hồ sơ với kiểm soát quyền truy cập.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFolderOpen(true)}>
            <FolderPlus className="h-4 w-4" /> Tạo thư mục
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> Upload tài liệu
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm tên file, khách hàng, mã hồ sơ..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Lọc theo khách hàng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả khách hàng</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={folderFilter} onValueChange={setFolderFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Thư mục" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả thư mục</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {folders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolderFilter(folderFilter === f.id ? 'all' : f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                folderFilter === f.id
                  ? 'border-primary bg-blue-50 text-primary'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Folder className="h-3.5 w-3.5 text-amber-500" />
              {f.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Danh sách tài liệu ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-y text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Tài liệu</th>
                <th className="px-4 py-3">Khách hàng / Hồ sơ</th>
                <th className="px-4 py-3">Phạm vi quyền</th>
                <th className="px-4 py-3">Người tải lên</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Đang tải kho tài liệu...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Chưa có tài liệu nào phù hợp
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span>{d.file_name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 pl-6">{formatFileSize(d.file_size)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{d.customer?.company_name}</div>
                      <div className="text-primary">{d.service_case?.case_code || 'Tài liệu chung KH'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{d.access_scope}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <div>{d.uploader?.full_name || '—'}</div>
                      <div className="text-[11px]">{formatDateTime(d.created_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => openPreview(d, false)}>
                        <Eye className="h-3.5 w-3.5" /> Xem
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openPreview(d, true)}>
                        <Download className="h-3.5 w-3.5" /> Tải
                      </Button>
                      {canDelete && (
                        <Button size="icon" variant="ghost" onClick={() => deleteDocMutation.mutate(d)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog Tạo thư mục */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo thư mục tài liệu</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createFolderMutation.mutate()
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Khách hàng *</Label>
              <Select
                value={folderForm.customer_id}
                onValueChange={(v) => setFolderForm({ ...folderForm, customer_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn khách hàng" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tên thư mục *</Label>
              <Input
                required
                placeholder="VD: Hồ sơ pháp lý gốc / Tờ khai thuế 2026"
                value={folderForm.name}
                onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFolderOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={createFolderMutation.isPending || !folderForm.customer_id}>
                Tạo thư mục
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Upload */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload tài liệu mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUploadSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label>Khách hàng *</Label>
              <Select
                value={uploadForm.customer_id}
                onValueChange={(v) => setUploadForm({ ...uploadForm, customer_id: v, case_id: '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn khách hàng" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Gắn vào hồ sơ (tùy chọn)</Label>
              <Select
                value={uploadForm.case_id}
                onValueChange={(v) => setUploadForm({ ...uploadForm, case_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn hồ sơ dịch vụ" />
                </SelectTrigger>
                <SelectContent>
                  {cases
                    .filter((cs) => !uploadForm.customer_id || cs.customer_id === uploadForm.customer_id)
                    .map((cs) => (
                      <SelectItem key={cs.id} value={cs.id}>
                        {cs.case_code} — {cs.procedure_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quyền truy cập</Label>
              <Select
                value={uploadForm.access_scope}
                onValueChange={(v) => setUploadForm({ ...uploadForm, access_scope: v as DocumentAccessScope })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="case_team">Nhóm xử lý hồ sơ</SelectItem>
                  <SelectItem value="all_staff">Toàn bộ nhân viên</SelectItem>
                  <SelectItem value="managers_only">Chỉ Quản lý / Admin</SelectItem>
                  <SelectItem value="finance">Phòng Kế toán / Tài chính</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Chọn tệp (PDF, Word, Excel, Ảnh — tối đa 25MB) *</Label>
              <Input
                type="file"
                required
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={uploading || !selectedFile || !uploadForm.customer_id}>
                {uploading ? 'Đang tải lên...' : 'Upload'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Preview Ảnh / PDF */}
      <Dialog open={Boolean(previewDoc)} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewDoc?.doc.file_name}</DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="w-full h-[70vh] bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
              {previewDoc.doc.mime_type?.startsWith('image/') ? (
                <img src={previewDoc.url} alt={previewDoc.doc.file_name} className="max-h-full max-w-full object-contain" />
              ) : (
                <iframe src={previewDoc.url} title={previewDoc.doc.file_name} className="w-full h-full border-0" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
