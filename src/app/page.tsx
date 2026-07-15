'use client'

import { useState, useEffect } from 'react'
import { Sidebar, Section } from '@/components/platform/sidebar'
import { Header } from '@/components/platform/header'
import { DashboardSection } from '@/components/sections/dashboard-section'
import { ProjectsSection } from '@/components/sections/projects-section'
import { AssetsSection } from '@/components/sections/assets-section'
import { DevicesSection } from '@/components/sections/devices-section'
import { DataCenterSection } from '@/components/sections/data-section'
import { MonitoringSection } from '@/components/sections/monitoring-section'
import { CalculationsSection } from '@/components/sections/calculations-section'
import { AttestationsSection } from '@/components/sections/attestations-section'
import { ReportsSection } from '@/components/sections/reports-section'
import { ImpactSection } from '@/components/sections/impact-section'
import { CalculatorSection } from '@/components/sections/calculator-section'
import { NotificationsSection } from '@/components/sections/notifications-section'
import { AuditSection } from '@/components/sections/audit-section'
import { SettingsSection } from '@/components/sections/settings-section'

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  dashboard: { title: 'مركز القيادة', subtitle: 'نظرة شاملة على أداء محفظة المشاريع الشمسية' },
  projects: { title: 'المشاريع والمواقع', subtitle: 'إدارة المشاريع الشمسية عبر دورة حياتها الكاملة' },
  assets: { title: 'الأصول الشمسية', subtitle: 'مصفوفات الألواح والأنظمة الشمسية وخصائصها الفنية' },
  devices: { title: 'إدارة الأجهزة', subtitle: 'الإنفرترات والعدادات وبوابات IoT وحالتها' },
  data: { title: 'مركز البيانات', subtitle: 'القراءات الخام والمطبّعة مع جودة وتدقيق' },
  monitoring: { title: 'مركز المراقبة', subtitle: 'الحوادث والتنبيهات وصحة النظام' },
  calculations: { title: 'الحسابات والمنهجيات', subtitle: 'حساب الكربون والأداء والوفر بإصدارات قابلة لإعادة الإنتاج' },
  attestations: { title: 'التوثيق والمطابقة', subtitle: 'توثيق حزم البيانات على شبكة Hedera' },
  reports: { title: 'التقارير', subtitle: 'تقارير معتمدة قابلة لإعادة الإنتاج والتدقيق' },
  impact: { title: 'سجل وحدات الأثر', subtitle: 'حسابات وأرصدة وحركات غير قابلة للتعديل' },
  calculator: { title: 'الحاسبة الاستثمارية', subtitle: 'NPV, IRR, Payback, LCOE مع سيناريوهات وتحليل حساسية' },
  notifications: { title: 'الإشعارات', subtitle: 'مركز الإشعارات والأحداث المهمة' },
  audit: { title: 'سجل التدقيق', subtitle: 'سجل append-only لكل الإجراءات الحساسة' },
  settings: { title: 'الإدارة والإعدادات', subtitle: 'المؤسسة والأعضاء والأدوار والأمن والتكاملات' },
}

export default function Home() {
  const [section, setSection] = useState<Section>('dashboard')
  const [unread, setUnread] = useState(0)
  const [openCases, setOpenCases] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    // Fetch quick stats for sidebar
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

    // Set lastUpdated after mount to avoid hydration mismatch
    Promise.resolve().then(() => {
      if (!cancelled && typeof window !== 'undefined') {
        setLastUpdated(new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }))
      }
    })

    return () => {
      cancelled = true
    }
  }, [section])

  const meta = SECTION_META[section]

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        current={section}
        onNavigate={setSection}
        unreadNotifications={unread}
        openCases={openCases}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          unreadNotifications={unread}
          lastUpdated={lastUpdated}
        />

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {section === 'dashboard' && <DashboardSection />}
          {section === 'projects' && <ProjectsSection />}
          {section === 'assets' && <AssetsSection />}
          {section === 'devices' && <DevicesSection />}
          {section === 'data' && <DataCenterSection />}
          {section === 'monitoring' && <MonitoringSection />}
          {section === 'calculations' && <CalculationsSection />}
          {section === 'attestations' && <AttestationsSection />}
          {section === 'reports' && <ReportsSection />}
          {section === 'impact' && <ImpactSection />}
          {section === 'calculator' && <CalculatorSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'audit' && <AuditSection />}
          {section === 'settings' && <SettingsSection />}
        </main>

        <footer className="mt-auto border-t bg-card py-4 px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>© 2026 BrightFuture Energy Co.</span>
              <span>•</span>
              <span>منصة ESG للطاقة الشمسية</span>
            </div>
            <div className="flex items-center gap-3">
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
