import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type StatusType =
  | 'active'
  | 'inactive'
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'suspended'
  | 'connected'
  | 'registered'
  | 'offline'
  | 'stale'
  | 'disabled'
  | 'decommissioned'
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'mismatch'
  | 'failed'
  | 'superseded'
  | 'validated'
  | 'suspect'
  | 'rejected'
  | 'corrected'
  | 'received'
  | 'valid'
  | 'invalid'
  | 'reviewed'
  | 'estimated'
  | 'verified'
  | 'issued'
  | 'transferred'
  | 'retired'
  | 'cancelled'
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'published'
  | 'revoked'

const STATUS_MAP: Record<StatusType, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  active: { label: 'نشط', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  inactive: { label: 'غير نشط', variant: 'secondary' },
  draft: { label: 'مسودة', variant: 'outline' },
  under_review: { label: 'قيد المراجعة', variant: 'outline', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300' },
  approved: { label: 'معتمد', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  suspended: { label: 'معلّق', variant: 'destructive' },
  connected: { label: 'متصل', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  registered: { label: 'مسجّل', variant: 'outline' },
  offline: { label: 'غير متصل', variant: 'destructive' },
  stale: { label: 'بيانات قديمة', variant: 'outline', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300' },
  disabled: { label: 'معطّل', variant: 'destructive' },
  decommissioned: { label: 'متقاعد', variant: 'secondary' },
  pending: { label: 'بالانتظار', variant: 'outline', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300' },
  submitted: { label: 'مُرسل', variant: 'outline', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300' },
  confirmed: { label: 'مؤكَّد', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  mismatch: { label: 'تباين', variant: 'destructive' },
  failed: { label: 'فشل', variant: 'destructive' },
  superseded: { label: 'مستبدل', variant: 'secondary' },
  validated: { label: 'متحقّق', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  suspect: { label: 'مشبوه', variant: 'outline', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300' },
  rejected: { label: 'مرفوض', variant: 'destructive' },
  corrected: { label: 'مصحّح', variant: 'default', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300' },
  received: { label: 'مستلَم', variant: 'secondary' },
  valid: { label: 'صالح', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  invalid: { label: 'غير صالح', variant: 'destructive' },
  reviewed: { label: 'مُراجَع', variant: 'default' },
  estimated: { label: 'تقديري', variant: 'outline' },
  verified: { label: 'متحقّق', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  issued: { label: 'مُصدَر', variant: 'default', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300' },
  transferred: { label: 'منقول', variant: 'secondary' },
  retired: { label: 'مُحال', variant: 'default', className: 'bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-300' },
  cancelled: { label: 'ملغى', variant: 'destructive' },
  open: { label: 'مفتوح', variant: 'outline', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-300' },
  in_progress: { label: 'قيد المعالجة', variant: 'outline', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-300' },
  resolved: { label: 'محلول', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  closed: { label: 'مغلق', variant: 'secondary' },
  published: { label: 'منشور', variant: 'default', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300' },
  revoked: { label: 'مُلغى', variant: 'destructive' },
}

export function StatusBadge({ status, customLabel }: { status: string; customLabel?: string }) {
  const config = STATUS_MAP[status as StatusType] || { label: status, variant: 'outline' as const }
  return (
    <Badge variant={config.variant} className={cn('text-xs font-medium', config.className)}>
      {customLabel || config.label}
    </Badge>
  )
}
