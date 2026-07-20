'use client'

import { useState } from 'react'
import {
  LayoutDashboard,
  FolderKanban,
  Cpu,
  Database,
  Activity,
  Calculator,
  FileBarChart,
  Coins,
  Bell,
  ScrollText,
  Settings,
  Sun,
  Menu,
  X,
  LogOut,
  Server,
  Zap,
  Users,
  Plug,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export type Section =
  | 'dashboard'
  | 'projects'
  | 'energy-performance'
  | 'assets-devices'
  | 'data'
  | 'monitoring'
  | 'calculations'
  | 'attestations'
  | 'reports'
  | 'impact'
  | 'calculator'
  | 'notifications'
  | 'audit'
  | 'users'
  | 'integrations'
  | 'settings'

interface NavItem {
  id: Section
  label: string
  labelEn: string
  icon: React.ComponentType<{ className?: string }>
  group: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'مركز القيادة', labelEn: 'Command Center', icon: LayoutDashboard, group: 'main' },
  { id: 'projects', label: 'المشاريع والمواقع', labelEn: 'Projects & Sites', icon: FolderKanban, group: 'main' },
  { id: 'energy-performance', label: 'الطاقة الكهربائية', labelEn: 'Energy Performance', icon: Zap, group: 'main' },
  { id: 'assets-devices', label: 'الأصول والأجهزة', labelEn: 'Assets & Devices', icon: Server, group: 'main' },
  { id: 'data', label: 'مركز البيانات', labelEn: 'Data Center', icon: Database, group: 'data' },
  { id: 'monitoring', label: 'مركز المراقبة', labelEn: 'Monitoring', icon: Activity, group: 'data' },
  { id: 'calculations', label: 'الحسابات (KPI Catalog)', labelEn: 'Calculations', icon: Calculator, group: 'data' },
  // 'attestations' (old batch-based Merkle Root attestation UI) intentionally hidden from
  // navigation — the platform now uses per-reading n8n + Blind Signer attestation instead.
  // The route and component still exist; only the sidebar entry point is removed.
  { id: 'impact', label: 'وحدات الأثر', labelEn: 'Impact Ledger', icon: Coins, group: 'attestation' },
  { id: 'reports', label: 'التقارير', labelEn: 'Reports', icon: FileBarChart, group: 'output' },
  { id: 'calculator', label: 'الحاسبة الاستثمارية', labelEn: 'Calculator', icon: Calculator, group: 'output' },
  { id: 'notifications', label: 'الإشعارات', labelEn: 'Notifications', icon: Bell, group: 'system' },
  { id: 'audit', label: 'سجل التدقيق', labelEn: 'Audit Log', icon: ScrollText, group: 'system' },
  { id: 'users', label: 'إدارة المستخدمين', labelEn: 'User Management', icon: Users, group: 'system' },
  { id: 'integrations', label: 'التكاملات', labelEn: 'Integrations', icon: Plug, group: 'system' },
  { id: 'settings', label: 'الإعدادات', labelEn: 'Settings', icon: Settings, group: 'system' },
]

const GROUP_LABELS: Record<string, string> = {
  main: 'الرئيسية',
  data: 'البيانات والمراقبة',
  attestation: 'التوثيق والتحقق',
  output: 'المخرجات',
  system: 'النظام',
}

interface SidebarProps {
  current: Section
  onNavigate: (s: Section) => void
  unreadNotifications?: number
  openCases?: number
  user?: { name?: string; email?: string; role?: string; nameAr?: string } | null
  onLogout?: () => void
}

export function Sidebar({ current, onNavigate, unreadNotifications = 0, openCases = 0, user, onLogout }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      toast.success('تم تسجيل الخروج بنجاح')
      onLogout?.()
    } catch {
      toast.error('فشل تسجيل الخروج')
    } finally {
      setLoggingOut(false)
    }
  }

  const grouped = NAV_ITEMS.reduce(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = []
      acc[item.group].push(item)
      return acc
    },
    {} as Record<string, NavItem[]>,
  )

  const handleNav = (s: Section) => {
    onNavigate(s)
    setMobileOpen(false)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 right-4 z-50 md:hidden bg-background/80 backdrop-blur h-10 w-10"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed md:sticky top-0 right-0 z-40 h-screen w-72 shrink-0',
          'bg-sidebar border-l border-sidebar-border',
          'flex flex-col transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex items-center gap-3 p-5 border-b border-sidebar-border">
          <img src="/logo.svg" alt="شعار المنصة" className="h-11 w-11 rounded-xl shrink-0 object-contain" />
          <div className="flex-1 min-w-0">
            <h1 className="font-cairo text-base font-bold leading-tight truncate">منصة ESG الشمسية</h1>
            <p className="text-xs text-muted-foreground truncate">BrightFuture Energy</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {GROUP_LABELS[group]}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon
                  const active = current === item.id
                  const badge =
                    item.id === 'notifications' && unreadNotifications > 0
                      ? unreadNotifications
                      : item.id === 'monitoring' && openCases > 0
                        ? openCases
                        : undefined
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        active
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm font-semibold'
                          : 'text-sidebar-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-right truncate">{item.label}</span>
                      {badge !== undefined && (
                        <Badge
                          variant={active ? 'secondary' : 'destructive'}
                          className="h-5 px-1.5 text-xs tabular-nums"
                        >
                          {badge}
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground font-semibold text-sm shrink-0">
              {(user?.nameAr || user?.name || user?.email || '؟').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.nameAr || user?.name || 'مستخدم'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              title="تسجيل الخروج"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
