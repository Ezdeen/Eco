'use client'

import { Search, Bell, Globe, Clock, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useState, useEffect } from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
  unreadNotifications?: number
  lastUpdated?: string
  onRefresh?: () => void
}

export function Header({ title, subtitle, unreadNotifications = 0, lastUpdated, onRefresh }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'Asia/Riyadh',
        }),
      )
    }
    // Only run on client to avoid hydration mismatch
    update()
    const t = setInterval(update, 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
      <div className="flex items-center gap-4 px-4 md:px-6 py-3">
        <div className="flex-1 min-w-0 pr-12 md:pr-0">
          <h2 className="font-cairo text-lg md:text-xl font-bold truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs md:text-sm text-muted-foreground truncate mt-0.5">{subtitle}</p>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-2 max-w-xs flex-1">
          <div className="relative w-full">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث..."
              className="pr-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-9 w-9" title="اللغة">
            <Globe className="h-4 w-4" />
          </Button>

          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground px-2">
            <Clock className="h-3.5 w-3.5" />
            <span className="tabular-nums">{currentTime}</span>
          </div>

          {onRefresh && (
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRefresh} title="تحديث">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}

          <Button variant="ghost" size="icon" className="h-9 w-9 relative" title="الإشعارات">
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center tabular-nums"
              >
                {unreadNotifications}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {lastUpdated && (
        <div className="px-4 md:px-6 pb-2 text-xs text-muted-foreground">
          <span>آخر تحديث: </span>
          <span className="tabular-nums">{lastUpdated}</span>
        </div>
      )}
    </header>
  )
}
