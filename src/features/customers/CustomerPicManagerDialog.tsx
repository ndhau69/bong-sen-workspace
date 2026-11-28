import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, UserCog, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { PIC_COLOR_PALETTE } from './customerColumns'
import type { CustomerPicOption } from '@/types/database'

interface CustomerPicManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  picOptions: CustomerPicOption[]
}

export function CustomerPicManagerDialog({
  open,
  onOpenChange,
  picOptions
}: CustomerPicManagerDialogProps) {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PIC_COLOR_PALETTE[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(PIC_COLOR_PALETTE[0])

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['customer-pic-options'] })
    queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmed = newName.trim()
      if (!trimmed) throw new Error('Vui lòng nhập tên PIC')
      const maxOrder = picOptions.reduce((m, p) => Math.max(m, p.sort_order), 0)
      const { error } = await supabase.from('customer_pic_options').insert({
        name: trimmed,
        color: newColor,
        sort_order: maxOrder + 1,
        is_active: true
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã thêm giá trị PIC mới vào droplist')
      setNewName('')
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const renameMutation = useMutation({
    mutationFn: async (option: CustomerPicOption) => {
      const trimmed = editName.trim()
      if (!trimmed) throw new Error('Tên PIC không được để trống')
      const { error } = await supabase
        .from('customer_pic_options')
        .update({ name: trimmed, color: editColor })
        .eq('id', option.id)
      if (error) throw error

      // Đồng bộ tên mới sang các khách hàng đang gán giá trị PIC cũ
      if (option.name !== trimmed) {
        const { error: syncErr } = await supabase
          .from('customers')
          .update({ pic_name: trimmed })
          .eq('pic_name', option.name)
        if (syncErr) throw syncErr
      }
    },
    onSuccess: () => {
      toast.success('Đã cập nhật PIC')
      setEditingId(null)
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('customer_pic_options')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateAll,
    onError: (err: Error) => toast.error(err.message)
  })

  const moveOrderMutation = useMutation({
    mutationFn: async ({ index, direction }: { index: number; direction: -1 | 1 }) => {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= picOptions.length) return
      const current = picOptions[index]
      const target = picOptions[targetIndex]
      const { error: e1 } = await supabase
        .from('customer_pic_options')
        .update({ sort_order: target.sort_order })
        .eq('id', current.id)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('customer_pic_options')
        .update({ sort_order: current.sort_order })
        .eq('id', target.id)
      if (e2) throw e2
    },
    onSuccess: invalidateAll,
    onError: (err: Error) => toast.error(err.message)
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customer_pic_options').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã xóa giá trị PIC khỏi droplist')
      invalidateAll()
    },
    onError: (err: Error) => toast.error(err.message)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Cấu hình Droplist PIC
          </DialogTitle>
          <DialogDescription>
            Tự định nghĩa danh sách người phụ trách (PIC) hiển thị trong droplist cột PIC và bộ lọc Khách hàng.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createMutation.mutate()
            }}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2.5"
          >
            <Label className="text-xs font-semibold text-slate-700">Thêm giá trị PIC mới</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="VD: Bông Sen - Minh, Hậu, Nhi - Đắc Xuân..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-[200px] bg-white"
              />
              <div className="flex items-center gap-1">
                {PIC_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-5 w-5 rounded-full border-2 transition-transform ${
                      newColor === c ? 'border-slate-900 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <Button type="submit" size="sm" disabled={createMutation.isPending || !newName.trim()}>
                <Plus className="h-4 w-4" />
                Thêm PIC
              </Button>
            </div>
          </form>

          <div className="border rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {picOptions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Chưa có giá trị PIC nào.</div>
            ) : (
              picOptions.map((opt, idx) => {
                const isEditing = editingId === opt.id
                return (
                  <div key={opt.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-sm">
                    {isEditing ? (
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 flex-1 min-w-[160px]"
                        />
                        <div className="flex items-center gap-1">
                          {PIC_COLOR_PALETTE.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditColor(c)}
                              className={`h-4 w-4 rounded-full border ${
                                editColor === c ? 'border-slate-900 scale-110' : 'border-transparent'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600"
                          onClick={() => renameMutation.mutate(opt)}
                          disabled={renameMutation.isPending}
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
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: opt.color || '#2563eb' }}
                          />
                          <span
                            className={`font-medium truncate ${
                              opt.is_active ? 'text-slate-800' : 'text-slate-400 line-through'
                            }`}
                          >
                            {opt.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            disabled={idx === 0 || moveOrderMutation.isPending}
                            onClick={() => moveOrderMutation.mutate({ index: idx, direction: -1 })}
                            title="Lên trên"
                          >
                            <ArrowUp className="h-3.5 w-3.5 text-slate-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            disabled={idx === picOptions.length - 1 || moveOrderMutation.isPending}
                            onClick={() => moveOrderMutation.mutate({ index: idx, direction: 1 })}
                            title="Xuống dưới"
                          >
                            <ArrowDown className="h-3.5 w-3.5 text-slate-500" />
                          </Button>
                          <Switch
                            checked={opt.is_active}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: opt.id, is_active: checked })
                            }
                            title="Bật/Tắt trong droplist"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditingId(opt.id)
                              setEditName(opt.name)
                              setEditColor(opt.color || PIC_COLOR_PALETTE[0])
                            }}
                            title="Sửa tên & màu"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => deleteMutation.mutate(opt.id)}
                            disabled={deleteMutation.isPending}
                            title="Xóa khỏi droplist"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })
            )}
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
