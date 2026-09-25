import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { createProjectFunderSchema } from '@/lib/validation'
import { computeCapitalShareAttribution, normalizeAttributionShare, totalAttributionShare } from '@/lib/attribution'

interface Params {
  params: Promise<{ id: string }>
}

// ============== إدارة الجهات الممولة ونسب الإسناد (PCAF Project Finance attribution) ==============
//
// GET: يعيد قائمة الممولين النشطين وغير النشطين لمشروع معيّن، مع مجموع نسب
// الإسناد الحالي (لتنبيه المستخدم إذا تجاوز 100%).
// POST: يضيف ممولاً جديدًا. عند attributionMethod = 'capital_share' مع توفر
// fundingAmount و projectTotalValue، تُحسب النسبة على الخادم (لا تُقبل من العميل
// مباشرة) عبر صيغة PCAF: Outstanding Amount / (Equity + Debt).

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id: projectId } = await params
    const auth = await requireProjectAccess(projectId, 'project:read')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    const funders = await db.projectFunder.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })

    const summary = totalAttributionShare(
      funders.map((f) => ({ ...f, attributionMethod: f.attributionMethod })),
    )

    return NextResponse.json({ funders, attributionSummary: summary })
  } catch (error) {
    console.error('Failed to list project funders:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب الممولين' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: projectId } = await params
    // Reuses project:update — funder/attribution data is project configuration,
    // governed the same way as the existing sponsorName/sponsorPhone fields.
    const auth = await requireProjectAccess(projectId, 'project:update')
    if (!auth.authorized) return auth.response

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true, currency: true },
    })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 })
    }

    const parsed = createProjectFunderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات الممول غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data

    // Resolve the attribution share server-side rather than trusting the client,
    // per the PCAF capital-share method (Outstanding Amount / Total Project Value).
    let attributionShare: number
    let clampWarning: string | null = null

    if (data.attributionMethod === 'manual') {
      const normalized = normalizeAttributionShare(data.attributionShare as number)
      attributionShare = normalized.share
      if (normalized.wasClamped) {
        clampWarning = 'تم تعديل النسبة المدخلة يدويًا لتقع ضمن النطاق المسموح 0-100%'
      }
    } else {
      const computed = computeCapitalShareAttribution(data.fundingAmount, data.projectTotalValue)
      if (computed !== null) {
        attributionShare = computed
      } else if (data.attributionShare !== undefined) {
        // Fallback: capital_share requested but amounts insufficient — accept an
        // explicitly supplied share while flagging it as effectively manual.
        const normalized = normalizeAttributionShare(data.attributionShare)
        attributionShare = normalized.share
        clampWarning = 'تعذّر حساب النسبة من المبالغ المُدخلة؛ تم استخدام النسبة المُدخلة مباشرة'
      } else {
        return NextResponse.json(
          { error: 'أدخل مبلغ التمويل وقيمة المشروع الإجمالية، أو أدخل نسبة الإسناد يدويًا' },
          { status: 400 },
        )
      }
    }

    // Warn (but don't block) if this pushes the project's total attribution
    // above 100% — that's a data-quality signal for the org to review, not
    // necessarily invalid (e.g. a funder was just deactivated but not yet
    // reflected), so it's surfaced rather than silently rejected.
    const existingFunders = await db.projectFunder.findMany({ where: { projectId, isActive: true } })
    const projectedTotal = totalAttributionShare([
      ...existingFunders.map((f) => ({ ...f, attributionMethod: f.attributionMethod })),
      { id: 'pending', funderName: data.funderName, attributionShare, attributionMethod: data.attributionMethod, isActive: true },
    ])

    const funder = await db.projectFunder.create({
      data: {
        projectId,
        funderName: data.funderName,
        funderNameAr: data.funderNameAr ?? null,
        fundingAmount: data.fundingAmount ?? null,
        projectTotalValue: data.projectTotalValue ?? null,
        attributionShare,
        attributionMethod: data.attributionMethod,
        attributionNote: data.attributionNote ?? null,
        currency: data.currency ?? project.currency ?? null,
        isActive: data.isActive,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        createdBy: auth.user.userId,
      },
    })

    await db.auditEvent.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        userId: auth.user.userId,
        actor: auth.user.email,
        action: 'project.funder.create',
        resource: 'project_funder',
        resourceId: funder.id,
        result: 'success',
        metadata: JSON.stringify({
          funderName: funder.funderName,
          attributionShare: funder.attributionShare,
          attributionMethod: funder.attributionMethod,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      funder,
      warnings: [
        clampWarning,
        projectedTotal.isOverAttributed
          ? `مجموع نسب الإسناد النشطة لهذا المشروع أصبح ${projectedTotal.totalPct}% (يتجاوز 100%). راجع بيانات الممولين لتفادي احتساب نفس الأثر أكثر من مرة في تقارير أكثر من بنك.`
          : null,
      ].filter(Boolean),
    })
  } catch (error) {
    console.error('Failed to create project funder:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إضافة الممول' }, { status: 500 })
  }
}
