'use client'

import { useState, useEffect } from 'react'
import { Sidebar, Section } from '@/components/platform/sidebar'
import { Header } from '@/components/platform/header'
import { LoginSection } from '@/components/auth/login-section'
import { DashboardSection } from '@/components/sections/dashboard-section'
import { ProjectsSection } from '@/components/sections/projects-section'
import { BaselineSection } from '@/components/sections/baseline-section'
import { EnergyPerformanceSection } from '@/components/sections/energy-performance-section'
import { AssetsDevicesSection } from '@/components/sections/assets-devices-section'
import { DataCenterSection } from '@/components/sections/data-section'
import { SpaceDataSection } from '@/components/sections/space-data-section'
import { MonitoringSection } from '@/components/sections/monitoring-section'
import { CalculationsSection } from '@/components/sections/calculations-section'
import { AttestationsSection } from '@/components/sections/attestations-section'
import { ReportsSection } from '@/components/sections/reports-section'
import { PortfolioSection } from '@/components/sections/portfolio-section'
import { ImpactSection } from '@/components/sections/impact-section'
import { CalculatorSection } from '@/components/sections/calculator-section'
import { NotificationsSection } from '@/components/sections/notifications-section'
import { AuditSection } from '@/components/sections/audit-section'
import { UserManagementSection } from '@/components/sections/user-management-section'
import { IntegrationsSection } from '@/components/sections/integrations-section'
import { SettingsSection } from '@/components/sections/settings-section'
import { DataEntryHome } from '@/components/platform/data-entry-home'
import { Loader2, Shield } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { appCopy, defaultLocale, type Locale } from '@/lib/i18n'

const SECTION_META: Record<Section, { title: Record<Locale, string>; subtitle: Record<Locale, string> }> = {
  dashboard: { title: { ar: 'مركز القيادة', en: 'Command Center' }, subtitle: { ar: 'نظرة شاملة على أداء محفظة المشاريع الشمسية', en: 'Overview of solar portfolio performance' } },
  projects: { title: { ar: 'المشاريع والمواقع', en: 'Projects & Sites' }, subtitle: { ar: 'إدارة المشاريع الشمسية عبر دورة حياتها الكاملة', en: 'Manage solar projects across their full lifecycle' } },
  baseline: { title: { ar: 'خط الأساس البيئي', en: 'Environmental Baseline' }, subtitle: { ar: 'احتساب الأثر البيئي قبل اعتماد الحل الأخضر (Before State) من بيانات تاريخية - dMRV', en: 'Calculate the pre-transition (Before State) environmental impact from historical data - dMRV' } },
  'energy-performance': { title: { ar: 'الطاقة الكهربائية', en: 'Energy Performance' }, subtitle: { ar: 'مؤشرات الأداء التشغيلي - Energy Performance', en: 'Operational performance indicators' } },
  'assets-devices': { title: { ar: 'الأصول والأجهزة', en: 'Assets & Devices' }, subtitle: { ar: 'المصفوفات الشمسية والإنفرترات والأجهزة في قسم موحد', en: 'Solar arrays, inverters, and devices in one section' } },
  data: { title: { ar: 'مركز البيانات', en: 'Data Center' }, subtitle: { ar: 'القراءات الخام والمطبّعة مع جودة وتدقيق', en: 'Raw and processed readings with quality control and auditing' } },
  'space-data': { title: { ar: 'البيانات الفضائية', en: 'Space Data' }, subtitle: { ar: 'بيانات الاستشعار عن بعد من NASA POWER وGoogle Earth Engine وCAMS حسب إحداثيات كل مشروع', en: 'Remote sensing data from NASA POWER, Google Earth Engine, and CAMS by project coordinates' } },
  monitoring: { title: { ar: 'مركز المراقبة', en: 'Monitoring' }, subtitle: { ar: 'الحوادث والتنبيهات وصحة النظام', en: 'Incidents, alerts, and system health' } },
  calculations: { title: { ar: 'الحسابات (KPI Catalog)', en: 'Calculations' }, subtitle: { ar: 'Environmental KPI Catalog - جميع المؤشرات البيئية بشكل موحد', en: 'Environmental KPI Catalog across all metrics' } },
  attestations: { title: { ar: 'التوثيق والمطابقة', en: 'Attestation' }, subtitle: { ar: 'توثيق حزم البيانات على شبكة Hedera', en: 'Document data bundles on Hedera network' } },
  reports: { title: { ar: 'التقارير', en: 'Reports' }, subtitle: { ar: 'تقارير معتمدة قابلة للتحميل بصيغ متعددة مع رسوم بيانية', en: 'Approved reports available in multiple formats with charts' } },
  portfolio: { title: { ar: 'محفظة التمويل الأخضر', en: 'Green Finance Portfolio' }, subtitle: { ar: 'إفصاح على مستوى المحفظة الكاملة — سعة ممولة، انبعاثات مُتجنَّبة بنصيب الممول، ونسب التحقق الفضائي والدفتري', en: 'Portfolio-level disclosure for financed capacity, avoided emissions, and verification metrics' } },
  impact: { title: { ar: 'سجل وحدات الأثر', en: 'Impact Ledger' }, subtitle: { ar: 'حسابات وأرصدة وحركات غير قابلة للتعديل', en: 'Immutable impact calculations, balances, and movements' } },
  calculator: { title: { ar: 'الحاسبة الاستثمارية', en: 'Investment Calculator' }, subtitle: { ar: 'NPV, IRR, Payback, LCOE مع سيناريوهات وتحليل حساسية', en: 'NPV, IRR, Payback, and LCOE with sensitivity scenarios' } },
  notifications: { title: { ar: 'الإشعارات', en: 'Notifications' }, subtitle: { ar: 'مركز الإشعارات والأحداث المهمة', en: 'Important alerts and event center' } },
  audit: { title: { ar: 'سجل التدقيق', en: 'Audit Log' }, subtitle: { ar: 'سجل append-only لكل الإجراءات الحساسة', en: 'Append-only log of sensitive actions' } },
  users: { title: { ar: 'إدارة المستخدمين', en: 'User Management' }, subtitle: { ar: 'إضافة وإزالة الأعضاء وتغيير الأدوار', en: 'Add members, remove users, and manage roles' } },
  integrations: { title: { ar: 'التكاملات', en: 'Integrations' }, subtitle: { ar: 'إدارة حالة الربط مع الخدمات الخارجية ومصادر البيانات', en: 'Manage external services and data integrations' } },
  settings: { title: { ar: 'الإدارة والإعدادات', en: 'Administration & Settings' }, subtitle: { ar: 'المؤسسة والأعضاء والأدوار والأمن والتكاملات', en: 'Organization, users, roles, security, and integrations' } },
}

export default function Home() {
  const [section, setSection] = useState<Section>('dashboard')
  const [unread, setUnread] = useState(0)
  const [openCases, setOpenCases] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [user, setUser] = useState<any | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [locale, setLocale] = useState<Locale>(defaultLocale)

  useEffect(() => {
    const stored = window.localStorage.getItem('eco-locale') as Locale | null
    if (stored === 'ar' || stored === 'en') setLocale(stored)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    window.localStorage.setItem('eco-locale', locale)
  }, [locale])

  // Check auth on mount
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setUser(d.user || null)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch quick stats when user is logged in
  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch('/api/notifications?unreadOnly=true')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setUnread(d.stats?.unread || 0)
      })
      .catch(() => {})

    fetch('/api/cases')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const stats = d.stats
        if (stats) setOpenCases((stats.open || 0) + (stats.inProgress || 0))
      })
      .catch(() => {})

    Promise.resolve().then(() => {
      if (!cancelled && typeof window !== 'undefined') {
        setLastUpdated(new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }))
      }
    })

    return () => {
      cancelled = true
    }
  }, [section, user])

  const handleLoginSuccess = (loggedInUser: any) => {
    setUser(loggedInUser)
    setSection('dashboard')
  }

  const handleLogout = () => {
    setUser(null)
    setUnread(0)
    setOpenCases(0)
  }

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <img src="/logo.svg" alt="شعار المنصة" className="h-16 w-16 rounded-2xl object-contain shadow-lg" />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{appCopy[locale].loading}</span>
        </div>
      </div>
    )
  }

  // Not authenticated → show login
  if (!user) {
    return <LoginSection onLoginSuccess={handleLoginSuccess} locale={locale} onLocaleChange={setLocale} />
  }

  // data_entry role: dedicated minimal screen, no sidebar, no access to any other section —
  // enforced here at the UI level and separately (more importantly) at the API level via
  // the 'project:create'-only permission set for this role.
  if (user.role === 'data_entry') {
    return <DataEntryHome user={user} onLogout={handleLogout} locale={locale} onLocaleChange={setLocale} />
  }

  const meta = SECTION_META[section] ?? SECTION_META.dashboard
  const title = meta.title[locale] ?? meta.title[defaultLocale]
  const subtitle = meta.subtitle[locale] ?? meta.subtitle[defaultLocale]

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        current={section}
        onNavigate={setSection}
        unreadNotifications={unread}
        openCases={openCases}
        user={user}
        onLogout={handleLogout}
        locale={locale}
        onLocaleChange={setLocale}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={title}
          subtitle={subtitle}
          unreadNotifications={unread}
          lastUpdated={lastUpdated}
          locale={locale}
          onLocaleChange={setLocale}
        />

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {section === 'dashboard' && <DashboardSection />}
          {section === 'projects' && <ProjectsSection />}
          {section === 'baseline' && <BaselineSection />}
          {section === 'energy-performance' && <EnergyPerformanceSection />}
          {section === 'assets-devices' && <AssetsDevicesSection />}
          {section === 'data' && <DataCenterSection />}
          {section === 'space-data' && <SpaceDataSection />}
          {section === 'monitoring' && <MonitoringSection />}
          {section === 'calculations' && <CalculationsSection />}
          {section === 'attestations' && <AttestationsSection />}
          {section === 'reports' && <ReportsSection />}
          {section === 'portfolio' && <PortfolioSection />}
          {section === 'impact' && <ImpactSection />}
          {section === 'calculator' && <CalculatorSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'audit' && <AuditSection />}
          {section === 'users' && user?.role === 'org_admin' && <UserManagementSection />}
          {section === 'users' && user?.role !== 'org_admin' && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Shield className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">{appCopy[locale].accessDenied}</p>
              </CardContent>
            </Card>
          )}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'settings' && <SettingsSection />}
        </main>

        <footer className="mt-auto border-t bg-card py-4 px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>© 2026 Eco Ledger</span>
              <span>•</span>
              <span>{appCopy[locale].platformDescription}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>{appCopy[locale].user} {user?.name || user?.email}</span>
              <span>•</span>
              <span>v1.0 MVP</span>
              <span>•</span>
              <span>GHG Protocol Scope 2</span>
              <span>•</span>
              <span>Hedera Testnet</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
