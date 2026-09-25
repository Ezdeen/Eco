'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, Calculator, X, Loader2, FolderKanban, Zap, Droplet, TreePine } from 'lucide-react'
import { ProjectBaselineManager, type BaselineProject } from '@/components/projects/project-baseline-manager'

const PROJECT_TYPE_LABEL: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  grid_tied: { label: 'طاقة شمسية - مرتبط بالشبكة', icon: Zap },
  hybrid: { label: 'طاقة شمسية - هجين', icon: Zap },
  off_grid: { label: 'طاقة شمسية - مستقل', icon: Zap },
  smart_irrigation: { label: 'ري ذكي', icon: Droplet },
  afforestation: { label: 'تشجير', icon: TreePine },
}

/**
 * قسم "خط الأساس البيئي" — مستقل ضمن أقسام المنصة (الشريط الجانبي)، وليس مدفونًا داخل
 * نموذج تعديل المشروع. يدخل المستخدم هنا، يكتب اسم المشروع للبحث عنه، وبمجرد اختياره
 * تُعرض تلقائيًا الحقول التي تلزم فعليًا (طاقة أو مياه) بحسب نوع ذلك المشروع، مع إمكانية
 * إضافة خط أساس جديد عبر زر (+) بنفس أسلوب بقية أقسام المنصة (مقارنة بـ project-funders-manager).
 */
export function BaselineSection() {
  const [projects, setProjects] = useState<BaselineProject[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [selected, setSelected] = useState<BaselineProject | null>(null)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        const list: BaselineProject[] = (d.projects || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          nameAr: p.nameAr,
          code: p.code,
          projectType: p.projectType,
          country: p.country,
        }))
        setProjects(list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.nameAr?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q),
    )
  }, [projects, query])

  const handleSelect = (p: BaselineProject) => {
    setSelected(p)
    setQuery('')
    setIsSearchOpen(false)
  }

  const handleClearSelection = () => {
    setSelected(null)
    setQuery('')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4 text-primary" />
            حاسبة خط الأساس البيئي (dMRV Baseline)
          </CardTitle>
          <CardDescription>
            ابحث عن مشروعك بالاسم لاحتساب أثره البيئي "قبل" اعتماد الحل الأخضر (فاتورة كهرباء/مياه تاريخية)،
            ليصبح مرجع المقارنة الرسمي مع قراءات العدادات الفعلية بعد التركيب — دون أي كلفة إضافية على المنشأة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selected ? (
            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setIsSearchOpen(true) }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="اكتب اسم المشروع..."
                className="pr-9"
              />
              {isSearchOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-64 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin ml-2" /> جاري تحميل المشاريع...
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">لا يوجد مشروع مطابق</p>
                  ) : (
                    filtered.map((p) => {
                      const meta = PROJECT_TYPE_LABEL[p.projectType]
                      const Icon = meta?.icon || FolderKanban
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelect(p)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm hover:bg-muted transition-colors"
                        >
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1 min-w-0 truncate">{p.nameAr || p.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{p.code}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <FolderKanban className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selected.nameAr || selected.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{selected.code}</Badge>
                    {PROJECT_TYPE_LABEL[selected.projectType] && (
                      <Badge variant="outline" className="text-[10px]">
                        {PROJECT_TYPE_LABEL[selected.projectType].label}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearSelection}>
                <X className="h-3.5 w-3.5 ml-1" />
                تغيير المشروع
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardContent className="pt-6">
            <ProjectBaselineManager project={selected} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
