'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Bell, CheckCircle2, AlertCircle, AlertTriangle, Info, Check } from 'lucide-react'
import { toast } from 'sonner'

export function NotificationsSection() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(() => {
    setLoading(true)
    fetch('/api/notifications')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        setNotifications(d?.notifications || [])
        setStats(d?.stats || null)
      })
      .catch(() => {
        setNotifications([])
        setStats(null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true)
        fetch('/api/notifications')
          .then((r) => { if (!r.ok) throw new Error(); return r.json() })
          .then((d) => {
            if (cancelled) return
            setNotifications(d?.notifications || [])
            setStats(d?.stats || null)
          })
          .catch(() => {
            if (cancelled) return
            setNotifications([])
            setStats(null)
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isRead: true }),
      })
      if (!res.ok) throw new Error()
      fetchNotifications()
    } catch {
      toast.error('فشل تحديث الإشعار')
    }
  }

  const markAllAsRead = async () => {
    try {
      for (const n of notifications.filter((n) => !n.isRead)) {
        const res = await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id, isRead: true }),
        })
        if (!res.ok) throw new Error()
      }
      toast.success('تم تعليم الكل كمقروء')
      fetchNotifications()
    } catch {
      toast.error('فشل تحديث الإشعارات')
    }
  }

  if (loading) {
    return <Card className="h-96 animate-pulse bg-muted/40" />
  }

  const ICONS = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
    error: <AlertCircle className="h-5 w-5 text-red-600" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600" />,
    info: <Info className="h-5 w-5 text-blue-600" />,
  }

  const BG = {
    success: 'bg-emerald-50 dark:bg-emerald-950/30',
    error: 'bg-red-50 dark:bg-red-950/30',
    warning: 'bg-amber-50 dark:bg-amber-950/30',
    info: 'bg-blue-50 dark:bg-blue-950/30',
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className="text-xl font-bold tabular-nums">{stats?.total || 0}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <p className="text-xs text-amber-700">غير مقروء</p>
          <p className="text-xl font-bold tabular-nums text-amber-600">{stats?.unread || 0}</p>
        </Card>
        <Card className="p-4 bg-red-50 dark:bg-red-950/30 border-red-200">
          <p className="text-xs text-red-700">أخطاء</p>
          <p className="text-xl font-bold tabular-nums text-red-600">{stats?.bySeverity?.error || 0}</p>
        </Card>
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <p className="text-xs text-amber-700">تحذيرات</p>
          <p className="text-xl font-bold tabular-nums text-amber-600">{stats?.bySeverity?.warning || 0}</p>
        </Card>
        <Card className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
          <p className="text-xs text-emerald-700">نجاح</p>
          <p className="text-xl font-bold tabular-nums text-emerald-600">{stats?.bySeverity?.success || 0}</p>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">عرض {notifications.length} إشعار</p>
        {(stats?.unread || 0) > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <Check className="h-4 w-4 ml-1" />
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      {/* Notifications list */}
      <div className="space-y-2">
        {notifications.map((n) => (
          <Card
            key={n.id}
            className={`overflow-hidden ${!n.isRead ? 'border-r-4 border-r-primary' : ''} ${BG[n.severity as keyof typeof BG] || ''}`}
          >
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">{ICONS[n.severity as keyof typeof ICONS] || ICONS.info}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className={`text-sm ${!n.isRead ? 'font-bold' : 'font-medium'}`}>{n.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">{n.category}</Badge>
                      {!n.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => markAsRead(n.id)}
                        >
                          تعليم كمقروء
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                    {new Date(n.createdAt).toLocaleString('ar-SA')}
                    {n.project && ` • ${n.project.nameAr || n.project.name}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {notifications.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">لا توجد إشعارات</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
