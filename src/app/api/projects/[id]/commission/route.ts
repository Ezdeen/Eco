import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectAccess } from '@/lib/authorization'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/projects/[id]/commission
 * تشغيل مشروع رسميًا — ينقل المشروع إلى status='active' ويعيّن commissionedAt=now().
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await requireProjectAccess(id, 'project:update')
    if (!auth.authorized) return auth.response
    const { user } = auth

    let body: { commissionedAt?: string } = {}
    try {
      const text = await request.text()
      if (text.trim()) body = JSON.parse(text)
    } catch {
      // body غير صالح — نتجاهله ونستخدم now()
    }

    let commissionedAt: Date
    if (body.commissionedAt) {
      const parsed = new Date(body.commissionedAt)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'تاريخ التشغيل غير صالح', field: 'commissionedAt' }, { status: 400 })
      }
      if (parsed.getTime() > Date.now() + 60 * 1000) {
        return NextResponse.json({ error: 'تاريخ التشغيل لا يمكن أن يكون في المستقبل', field: 'commissionedAt' }, { status: 400 })
      }
      commissionedAt = parsed
    } else {
      commissionedAt = new Date()
    }

    const existing = await db.project.findUnique({
      where: { id },
      select: {
        id: true, organizationId: true, code: true, name: true,
        status: true, commissionedAt: true, projectType: true,
        capacityKwp: true, latitude: true, longitude: true,
        _count: { select: { sites: true, assets: true, devices: true } },
      },
    })

    if (!existing) return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })

    if (existing.status === 'decommissioned') {
      return NextResponse.json(
        { error: 'لا يمكن تشغيل مشروع متقاعد. أنشئ مشروعًا جديدًا أو اطلب إعادة تفعيله يدويًا.' },
        { status: 400 },
      )
    }

    const warnings: string[] = []
    if (existing._count.sites === 0) warnings.push('المشروع ليس لديه موقع جغرافي محدد')
    if (existing._count.assets === 0) warnings.push('المشروع ليس لديه أصول مسجلة')
    if (existing._count.devices === 0 && existing.projectType !== 'afforestation') {
      warnings.push('المشروع ليس لديه أجهزة (إنفرتر/مستشعر) مسجلة')
    }
    if (existing.capacityKwp === null && existing.projectType !== 'afforestation') {
      warnings.push('القدرة المنصوبة (kWp) غير محددة')
    }
    if (existing.latitude === null || existing.longitude === null) {
      warnings.push('الإحداثيات الجغرافية غير محددة')
    }

    const updated = await db.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: {
          status: 'active',
          commissionedAt: existing.commissionedAt ?? commissionedAt,
        },
      })

      await tx.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          projectId: id,
          userId: user.userId,
          actor: user.email,
          action: 'project.commission',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({
            code: existing.code,
            name: existing.name,
            previousStatus: existing.status,
            newStatus: 'active',
            commissionedAt: project.commissionedAt,
            warnings,
          }),
        },
      })

      return project
    })

    return NextResponse.json({
      success: true,
      project: updated,
      warnings: warnings.length > 0 ? warnings : undefined,
      message: 'تم تشغيل المشروع رسميًا',
    })
  } catch (error) {
    console.error('Commission project error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }
    return NextResponse.json({ error: 'حدث خطأ أثناء تشغيل المشروع', details: String(error) }, { status: 500 })
  }
}
