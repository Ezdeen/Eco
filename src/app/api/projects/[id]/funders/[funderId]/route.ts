import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'
import { updateProjectFunderSchema } from '@/lib/validation'
import { computeCapitalShareAttribution, normalizeAttributionShare } from '@/lib/attribution'

interface Params {
  params: Promise<{ id: string; funderId: string }>
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id: projectId, funderId } = await params
    const auth = await requireProjectAccess(projectId, 'project:update')
    if (!auth.authorized) return auth.response

    const existing = await db.projectFunder.findUnique({ where: { id: funderId } })
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: 'الممول غير موجود لهذا المشروع' }, { status: 404 })
    }

    const project = await db.project.findUnique({ where: { id: projectId }, select: { organizationId: true } })
    if (!project) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'صيغة JSON غير صالحة' }, { status: 400 })
    }

    const parsed = updateProjectFunderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات التحديث غير صحيحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const data = parsed.data

    const nextMethod = data.attributionMethod ?? existing.attributionMethod
    const nextFundingAmount = data.fundingAmount !== undefined ? data.fundingAmount : existing.fundingAmount
    const nextProjectTotalValue =
      data.projectTotalValue !== undefined ? data.projectTotalValue : existing.projectTotalValue

    let attributionShare = existing.attributionShare
    let clampWarning: string | null = null

    if (data.attributionShare !== undefined || data.fundingAmount !== undefined || data.projectTotalValue !== undefined || data.attributionMethod !== undefined) {
      if (nextMethod === 'manual') {
        const raw = data.attributionShare !== undefined ? data.attributionShare : existing.attributionShare
        const normalized = normalizeAttributionShare(raw)
        attributionShare = normalized.share
        if (normalized.wasClamped) {
          clampWarning = 'تم تعديل النسبة المدخلة يدويًا لتقع ضمن النطاق المسموح 0-100%'
        }
      } else {
        const computed = computeCapitalShareAttribution(nextFundingAmount, nextProjectTotalValue)
        if (computed !== null) {
          attributionShare = computed
        } else if (data.attributionShare !== undefined) {
          const normalized = normalizeAttributionShare(data.attributionShare)
          attributionShare = normalized.share
          clampWarning = 'تعذّر حساب النسبة من المبالغ المُدخلة؛ تم استخدام النسبة المُدخلة مباشرة'
        }
      }
    }

    const updated = await db.projectFunder.update({
      where: { id: funderId },
      data: {
        funderName: data.funderName ?? undefined,
        funderNameAr: data.funderNameAr !== undefined ? data.funderNameAr : undefined,
        fundingAmount: data.fundingAmount !== undefined ? data.fundingAmount : undefined,
        projectTotalValue: data.projectTotalValue !== undefined ? data.projectTotalValue : undefined,
        attributionShare,
        attributionMethod: nextMethod,
        attributionNote: data.attributionNote !== undefined ? data.attributionNote : undefined,
        currency: data.currency !== undefined ? data.currency : undefined,
        isActive: data.isActive !== undefined ? data.isActive : undefined,
        effectiveFrom: data.effectiveFrom !== undefined ? (data.effectiveFrom ? new Date(data.effectiveFrom) : null) : undefined,
        effectiveTo: data.effectiveTo !== undefined ? (data.effectiveTo ? new Date(data.effectiveTo) : null) : undefined,
      },
    })

    await db.auditEvent.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        userId: auth.user.userId,
        actor: auth.user.email,
        action: 'project.funder.update',
        resource: 'project_funder',
        resourceId: funderId,
        result: 'success',
        metadata: JSON.stringify({ changedFields: Object.keys(data), newAttributionShare: attributionShare }),
      },
    })

    return NextResponse.json({ success: true, funder: updated, warnings: [clampWarning].filter(Boolean) })
  } catch (error) {
    console.error('Failed to update project funder:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث الممول' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id: projectId, funderId } = await params
    const auth = await requireProjectAccess(projectId, 'project:update')
    if (!auth.authorized) return auth.response

    const existing = await db.projectFunder.findUnique({ where: { id: funderId } })
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: 'الممول غير موجود لهذا المشروع' }, { status: 404 })
    }

    const project = await db.project.findUnique({ where: { id: projectId }, select: { organizationId: true } })

    await db.projectFunder.delete({ where: { id: funderId } })

    if (project) {
      await db.auditEvent.create({
        data: {
          organizationId: project.organizationId,
          projectId,
          userId: auth.user.userId,
          actor: auth.user.email,
          action: 'project.funder.delete',
          resource: 'project_funder',
          resourceId: funderId,
          result: 'success',
          metadata: JSON.stringify({ funderName: existing.funderName }),
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete project funder:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الممول' }, { status: 500 })
  }
}
