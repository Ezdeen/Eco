import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'
import { portfolioReportSchema } from '@/lib/validation'
import { aggregatePortfolioMetrics } from '@/lib/portfolio-aggregation'

// GET /api/portfolio-reports
// يسرد لقطات (snapshots) تقارير المحفظة المحفوظة سابقًا لمنظمة المستخدم الحالي.
export async function GET() {
  try {
    const auth = await requirePermission('portfolio:read')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const reports = await db.portfolioReport.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, periodStart: true, periodEnd: true,
        status: true, createdAt: true, createdBy: true, projectIds: true,
      },
    })

    return NextResponse.json({
      reports: reports.map((r) => ({
        ...r,
        projectCount: (() => {
          try {
            return (JSON.parse(r.projectIds) as string[]).length
          } catch {
            return 0
          }
        })(),
      })),
      total: reports.length,
    })
  } catch (error: any) {
    console.error('Portfolio reports GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب تقارير المحفظة' }, { status: 500 })
  }
}

// POST /api/portfolio-reports
// يُجمِّد لقطة (snapshot) حالية من مؤشرات المحفظة ويحفظها بشكل دائم — هذا هو المرفق
// الذي يُرسَل فعليًا للبنك/المدقق، بخلاف GET /api/portfolio الذي يُعيد الأرقام الحية فقط
// دون حفظ. بنفس مبدأ AttestationBatch: الأرقام تُجمَّد وقت الإصدار ولا تتغيّر تلقائيًا
// لاحقًا حتى لو تغيّرت بيانات المشاريع بعد ذلك.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('portfolio:read')
    if (!auth.authorized) return auth.response
    const { user } = auth

    if (!user.organizationId) {
      return NextResponse.json({ error: 'لا توجد منظمة مرتبطة بهذا الحساب' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const parsed = portfolioReportSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'بيانات غير صالحة' }, { status: 400 })
    }
    const { title, periodStart, periodEnd, projectIds, methodologyNote } = parsed.data

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ error: 'الفترة الزمنية غير صالحة' }, { status: 400 })
    }

    const result = await aggregatePortfolioMetrics(user.organizationId, {
      projectIds: projectIds && projectIds.length > 0 ? projectIds : undefined,
      periodStart: start,
      periodEnd: end,
    })

    if (result.projectIds.length === 0) {
      return NextResponse.json({ error: 'لا توجد مشاريع مطابقة لإصدار تقرير محفظة' }, { status: 400 })
    }

    // نُخزِّن المؤشرات الكلية + تفصيل كل مشروع معًا في حقل metrics الواحد (JSON)، بدل
    // حقل منفصل، لتجنّب مكالمة storage إضافية وللحفاظ على "لقطة" واحدة متماسكة تحتوي كل
    // ما يحتاجه استرجاعها لاحقًا (بما في ذلك تصدير PDF) دون إعادة الاستعلام عن المشاريع.
    const frozenPayload = {
      ...result.metrics,
      projects: result.projects,
    }

    const saved = await db.portfolioReport.create({
      data: {
        organizationId: user.organizationId,
        title: title.trim(),
        periodStart: start,
        periodEnd: end,
        projectIds: JSON.stringify(result.projectIds),
        metrics: JSON.stringify(frozenPayload),
        methodologyNote: methodologyNote?.trim() || null,
        status: 'draft',
        createdBy: user.userId,
      },
    })

    return NextResponse.json(
      {
        id: saved.id,
        title: saved.title,
        status: saved.status,
        createdAt: saved.createdAt,
        metrics: result.metrics,
        projects: result.projects,
        projectIds: result.projectIds,
      },
      { status: 201 },
    )
  } catch (error: any) {
    console.error('Portfolio report create error:', error)
    return NextResponse.json({ error: error?.message || 'حدث خطأ أثناء إنشاء تقرير المحفظة' }, { status: 500 })
  }
}
