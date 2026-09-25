'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface DeleteProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: any | null
  onDeleted: () => void
}

export function DeleteProjectDialog({ open, onOpenChange, project, onDeleted }: DeleteProjectDialogProps) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!project) return

    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'فشل حذف المشروع')
        return
      }

      toast.success('تم حذف المشروع بنجاح')
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            تأكيد حذف المشروع
          </AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من حذف المشروع{' '}
            <strong className="text-foreground">
              {project?.nameAr || project?.name}
            </strong>{' '}
            ({project?.code})؟
            <br />
            <br />
            سيتم حذف جميع البيانات المرتبطة به نهائيًا: المواقع، الأصول، الأجهزة، القراءات، الحسابات، التقارير، الحالات، والإشعارات.
            <br />
            <br />
            <span className="text-red-600 font-medium">
              ⚠️ ملاحظة: لا يمكن حذف المشاريع التي تحتوي على توثيقات Hedera أو وحدات أثر لضمان سلامة السجل. يمكنك إيقاف المشروع بدلاً من حذفه.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                جاري الحذف...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 ml-1" />
                نعم، احذف المشروع
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
