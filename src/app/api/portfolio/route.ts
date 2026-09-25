import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authorization'
import { aggregatePortfolioMetrics } from '@/lib/portfolio-aggregation'

// GET /api/portfolio
// يُعيد مؤشرات "محفظة التمويل الأخضر" الثمانية محسوبة حيًا (بدون حفظ) عبر كل مشاريع
// منظمة المستخدم الحالي، أو مجموعة فرعية منها.
// Query params (اختيارية):
//   projectIds  - قائمة معرّفات مشاريع مفصولة بفواصل (تحديد جزء من المحفظة فقط)
//   periodStart - ISO date (افتراضيًا: بداية عمر أول مشروع)
//   periodEnd   - ISO date (افتراضيًا: الآن)
export async function GET(request: NextRequest) {
  try {
    // portfolio:read محصورة على org_admin فقط (انظر authorization.ts) — تجميع يكشف
    // بيانات عبر كل مشاريع المنظمة، بخلاف project_manager المحصور ببياناته الخاصة.
    const auth = await requirePermission('portfolio:read')
    if (!auth.authorized) return auth.response
    const { user } = auth

    if (!user.organizationId) {
      return NextResponse.json({ error: 'لا توجد منظمة مرتبطة بهذا الحساب' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const projectIdsParam = searchParams.get('projectIds')
    const projectIds = projectIdsParam
      ? projectIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined

    const periodStartParam = searchParams.get('periodStart')
    const periodEndParam = searchParams.get('periodEnd')

    let periodStart: Date | undefined
    let periodEnd: Date | undefined

    if (periodStartParam) {
      const d = new Date(periodStartParam)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'periodStart غير صالح' }, { status: 400 })
      }
      periodStart = d
    }
    if (periodEndParam) {
      const d = new Date(periodEndParam)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'periodEnd غير صالح' }, { status: 400 })
      }
      periodEnd = d
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      return NextResponse.json({ error: 'periodStart يجب أن يسبق periodEnd' }, { status: 400 })
    }

    const result = await aggregatePortfolioMetrics(user.organizationId, {
      projectIds,
      periodStart,
      periodEnd,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Portfolio aggregation error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ أثناء تجميع مؤشرات المحفظة' }, { status: 500 })
  }
}
