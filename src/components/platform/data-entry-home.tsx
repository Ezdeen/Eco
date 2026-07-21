'use client'

import { useState } from 'react'
import { ProjectFormModal } from '@/components/projects/project-form-modal'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, PlusCircle, LogOut } from 'lucide-react'
import { toast } from 'sonner'

interface DataEntryHomeProps {
  user: { name?: string; nameAr?: string; email?: string } | null
  onLogout: () => void
}

// Dedicated, minimal home screen for the "مدخل البيانات" role: they can only ever create
// a new project, with no sidebar, no navigation, and no visibility into any other part
// of the platform. This is enforced here at the UI level, and separately (more importantly)
// at the API level via the 'project:create'-only permission set for this role.
export function DataEntryHome({ user, onLogout }: DataEntryHomeProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [justCreated, setJustCreated] = useState(false)

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      toast.success('تم تسجيل الخروج بنجاح')
      onLogout()
    } catch {
      toast.error('فشل تسجيل الخروج')
    }
  }

  const handleSaved = () => {
    setJustCreated(true)
    setModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="شعار المنصة" className="h-9 w-9 rounded-lg object-contain" />
            <div>
              <p className="text-sm font-semibold">منصة ESG الشمسية</p>
              <p className="text-xs text-muted-foreground">مدخل بيانات</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user?.nameAr || user?.name || 'مستخدم'}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="تسجيل الخروج">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <PlusCircle className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">إنشاء مشروع جديد</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  صلاحية حسابك تقتصر على إدخال بيانات مشروع جديد فقط. لا يمكنك الوصول
                  لأقسام أخرى بالمنصة.
                </p>
              </div>
              <Button size="lg" className="w-full" onClick={() => setModalOpen(true)}>
                <PlusCircle className="h-4 w-4 ml-2" />
                إنشاء مشروع جديد
              </Button>
            </CardContent>
          </Card>

          {justCreated && (
            <Card className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200">
              <CardContent className="p-4 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  تم إنشاء المشروع بنجاح
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <ProjectFormModal open={modalOpen} onOpenChange={setModalOpen} onSaved={handleSaved} />
    </div>
  )
}
