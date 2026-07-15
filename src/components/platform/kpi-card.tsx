'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  unit?: string
  icon?: LucideIcon
  trend?: number // percentage
  trendLabel?: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  sublabel?: string
}

const variantStyles = {
  default: 'bg-card',
  success: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
  warning: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  danger: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  info: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
}

const iconBg = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  danger: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  info: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
}

export function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
  trend,
  trendLabel,
  variant = 'default',
  sublabel,
}: KpiCardProps) {
  return (
    <Card className={cn('relative overflow-hidden', variantStyles[variant])}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground font-medium mb-1.5 truncate">{label}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="font-cairo text-2xl md:text-3xl font-bold tabular-nums truncate">
                {value}
              </span>
              {unit && <span className="text-xs md:text-sm text-muted-foreground">{unit}</span>}
            </div>
            {sublabel && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{sublabel}</p>
            )}
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                {trend >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                )}
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    trend >= 0 ? 'text-emerald-600' : 'text-red-600',
                  )}
                >
                  {trend >= 0 ? '+' : ''}
                  {trend}%
                </span>
                {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
              </div>
            )}
          </div>
          {Icon && (
            <div
              className={cn(
                'flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl shrink-0',
                iconBg[variant],
              )}
            >
              <Icon className="h-5 w-5 md:h-6 md:w-6" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
