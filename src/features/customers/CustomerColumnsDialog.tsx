import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Columns3, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { FIELD_TYPE_LABELS, toCustomColumnKey } from './customerColumns'
import type { CustomerColumnConfig, CustomerFieldType } from '@/types/database'

interface CustomerColumnsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: CustomerColumnConfig[]
}

export function CustomerColumnsDialog({
  open,
  onOpenChange,
  columns
}: CustomerColumnsDialogProps) {
  const queryClient = useQueryClient()
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState<CustomerFieldType>('text')
  const [newOptionsText, setNewOptionsText] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editOptionsText, setEditOptionsText] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['customer-column-configs'] })
  }

  const addColumnMutation = useMutation({
    mutationFn: async () => {
      const label = newLabel.trim()
      if (!label) throw new Error('Vui lòng nhập tên cột')
      const maxOrder = columns.reduce((m, c) => Math.max(m, c.sort_order), 0)
      const parsedOptions =
        newType === 'select'
          ? newOptionsText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : []
      if (newType === 'select' && parsedOptions.length === 0) {
        throw new Error('Cột kiểu Droplist cần ít nhất 1 giá trị (cách nhau bởi dấu phẩy)')
      }
      const { error } = await supabase.from('customer_column_configs').insert({
        column_key: toCustomColumnKey(label),
        label,
        field_type: newType,
        is_system: false,
        is_visible: true,
        sort_order: maxOrder + 1,
        options: parsedOptions
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã thêm cột mới và bật hiển thị trên bảng Khách hàng')
      setNewLabel('')
      setNewType('text')
      setNewOptionsText('')
      invalidate()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, is_visible }: { id: string; is_visible: boolean }) => {
      const { error } = await supabase
        .from('customer_column_configs')
        .update({ is_visible })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message)
  })

  const updateColumnMutation = useMutation({
    mutationFn: async (col: CustomerColumnConfig) => {
      const trimmed = editLabel.trim()
      if (!trimmed) throw new Error('Tên cột không được để trống')
      const payload: { label: string; options?: string[] } = { label: trimmed }
      if (col.field_type === 'select' && col.column_key !== 'pic_name' && col.column_key !== 'business_type') {
        payload.options = editOptionsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
      const { error } = await supabase
        .from('customer_column_configs')
        .update(payload)
        .eq('id', col.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã cập nhật cấu hình cột')
      setEditingId(null)
      invalidate()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const moveOrderMutation = useMutation({
    mutationFn: async ({ index, direction }: { index: number; direction: -1 | 1 }) => {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= columns.length) return
      const current = columns[index]
      const target = columns[targetIndex]
      const { error: e1 } = await supabase
        .from('customer_column_configs')
        .update({ sort_order: target.sort_order })
        .eq('id', current.id)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('customer_column_configs')
        .update({ sort_order: current.sort_order })
        .eq('id', target.id)
      if (e2) throw e2
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message)
  })

  const deleteColumnMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customer_column_configs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã xóa cột tùy chỉnh')
      invalidate()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns3 className="h-5 w-5 text-primary" />
            Tùy chỉnh cột &amp; Thêm cột mới
          </DialogTitle>
          <DialogDescription>
            Bật/tắt các cột sẵn có (như Địa chỉ, Ghi chú, Email...) hoặc tạo thêm cột tùy ý mới. Cấu hình được lưu chung cho toàn hệ thống.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addColumnMutation.mutate()
            }}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5"
          >
            <Label className="text-xs font-semibold text-slate-700">Thêm cột tùy ý mới</Label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <Input
                placeholder="Tên cột (VD: Hạn CKS, Địa chỉ kho, Nguồn KH...)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="sm:col-span-6 bg-white"
              />
              <Select value={newType} onValueChange={(v) => setNewType(v as CustomerFieldType)}>
                <SelectTrigger className="sm:col-span-4 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIELD_TYPE_LABELS) as CustomerFieldType[]).map((ft) => (
                    <SelectItem key={ft} value={ft}>
                      {FIELD_TYPE_LABELS[ft]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="submit"
                size="sm"
                className="sm:col-span-2"
                disabled={addColumnMutation.isPending || !newLabel.trim()}
              >
                <Plus className="h-4 w-4" />
                Thêm
              </Button>
            </div>
            {newType === 'select' && (
              <Input
                placeholder="Nhập các giá trị droplist, cách nhau bởi dấu phẩy (VD: Theo tháng, Theo quý, Trọn gói)"
                value={newOptionsText}
                onChange={(e) => setNewOptionsText(e.target.value)}
                className="bg-white text-xs"
              />
            )}
          </form>

          <div className="border rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {columns.map((col, idx) => {
              const isEditing = editingId === col.id
              const isCompanyName = col.column_key === 'company_name'
              const showOptionsEditor =
                col.field_type === 'select' && col.column_key !== 'pic_name' && col.column_key !== 'business_type'

              return (
                <div key={col.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-sm">
                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="h-8 flex-1"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600"
                          onClick={() => updateColumnMutation.mutate(col)}
                          disabled={updateColumnMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-500"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {showOptionsEditor && (
                        <Input
                          value={editOptionsText}
                          onChange={(e) => setEditOptionsText(e.target.value)}
                          placeholder="Giá trị droplist, cách nhau bởi dấu phẩy..."
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-slate-400 w-5">{idx + 1}.</span>
                        <span className={`font-medium truncate ${col.is_visible ? 'text-slate-900' : 'text-slate-400'}`}>
                          {col.label}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {FIELD_TYPE_LABELS[col.field_type]}
                        </Badge>
                        {!col.is_system && (
                          <Badge variant="secondary" className="text-[10px]">
                            Tùy chỉnh
                          </Badge>
                        )}
                        {isCompanyName && (
                          <Badge className="text-[10px] bg-blue-50 text-blue-700 hover:bg-blue-50">
                            Cột chính
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={idx === 0 || moveOrderMutation.isPending}
                          onClick={() => moveOrderMutation.mutate({ index: idx, direction: -1 })}
                          title="Chuyển lên"
                        >
                          <ArrowUp className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={idx === columns.length - 1 || moveOrderMutation.isPending}
                          onClick={() => moveOrderMutation.mutate({ index: idx, direction: 1 })}
                          title="Chuyển xuống"
                        >
                          <ArrowDown className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <Switch
                          checked={col.is_visible}
                          disabled={isCompanyName}
                          onCheckedChange={(checked) =>
                            toggleVisibilityMutation.mutate({ id: col.id, is_visible: checked })
                          }
                          title={isCompanyName ? 'Cột chính luôn hiển thị' : 'Hiện/Ẩn cột trên bảng'}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingId(col.id)
                            setEditLabel(col.label)
                            setEditOptionsText(Array.isArray(col.options) ? col.options.join(', ') : '')
                          }}
                          title="Đổi tên cột / tùy chọn"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-600" />
                        </Button>
                        {!col.is_system && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => deleteColumnMutation.mutate(col.id)}
                            disabled={deleteColumnMutation.isPending}
                            title="Xóa cột tùy chỉnh"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
