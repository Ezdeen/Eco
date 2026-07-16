import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

interface Params {
  params: Promise<{ id: string }>
}

// GET single project with full details
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const project = await db.project.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true, nameAr: true, code: true } },
        sites: true,
        assets: { include: { solarProfile: true } },
        devices: true,
        _count: { select: { readings: true, cases: true, attestations: true, reports: true } },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error('Get project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - update project
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      nameAr,
      code,
      country,
      city,
      latitude,
      longitude,
      capacityKwp,
      currency,
      sponsorName,
      sponsorPhone,
      inverterSerial,
      inverterType,
      status,
      projectType,
      timezone,
      tariffRetail,
      tariffFeedIn,
    } = body

    const existing = await db.project.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Check code uniqueness if changed
    if (code && code !== existing.code) {
      const conflict = await db.project.findFirst({
        where: {
          organizationId: existing.organizationId,
          code,
          id: { not: id },
        },
      })
      if (conflict) {
        return NextResponse.json(
          { error: 'رمز المشروع مستخدم في مشروع آخر' },
          { status: 409 },
        )
      }
    }

    // Check inverter serial uniqueness if changed
    if (inverterSerial && inverterSerial !== existing.inverterSerial) {
      const conflict = await db.project.findFirst({
        where: { inverterSerial, id: { not: id } },
      })
      if (conflict) {
        return NextResponse.json(
          { error: 'سيريال نمبر الإنفرتر مستخدم في مشروع آخر' },
          { status: 409 },
        )
      }
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (nameAr !== undefined) updateData.nameAr = nameAr
    if (code !== undefined) updateData.code = code
    if (country !== undefined) updateData.country = country
    if (city !== undefined) updateData.city = city
    if (latitude !== undefined) updateData.latitude = parseFloat(latitude)
    if (longitude !== undefined) updateData.longitude = parseFloat(longitude)
    if (capacityKwp !== undefined) updateData.capacityKwp = capacityKwp ? parseFloat(capacityKwp) : null
    if (currency !== undefined) updateData.currency = currency
    if (sponsorName !== undefined) updateData.sponsorName = sponsorName || null
    if (sponsorPhone !== undefined) updateData.sponsorPhone = sponsorPhone || null
    if (inverterSerial !== undefined) updateData.inverterSerial = inverterSerial
    if (inverterType !== undefined) updateData.inverterType = inverterType
    if (status !== undefined) updateData.status = status
    if (projectType !== undefined) updateData.projectType = projectType
    if (timezone !== undefined) updateData.timezone = timezone
    if (tariffRetail !== undefined) updateData.tariffRetail = tariffRetail ? parseFloat(tariffRetail) : null
    if (tariffFeedIn !== undefined) updateData.tariffFeedIn = tariffFeedIn ? parseFloat(tariffFeedIn) : null

    const project = await db.project.update({
      where: { id },
      data: updateData,
    })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          projectId: id,
          userId: user.userId,
          actor: user.email,
          action: 'project.update',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({ updatedFields: Object.keys(updateData) }),
        },
      })
    } catch {}

    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث المشروع' }, { status: 500 })
  }
}

// DELETE - delete project
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const existing = await db.project.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        name: true,
        code: true,
        _count: { select: { readings: true, attestations: true, reports: true, impactUnits: true } },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'المشروع غير موجود' }, { status: 404 })
    }

    // Prevent deletion if project has attestations or impact units (data integrity)
    if (existing._count.attestations > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف المشروع لوجود توثيقات Hedera مرتبطة به. يرجى إيقاف المشروع بدلاً من حذفه.' },
        { status: 409 },
      )
    }

    if (existing._count.impactUnits > 0) {
      return NextResponse.json(
        { error: 'لا يمكن حذف المشروع لوجود وحدات أثر مرتبطة به. يرجى إيقاف المشروع بدلاً من حذفه.' },
        { status: 409 },
      )
    }

    // Delete project (cascade will handle related records)
    await db.project.delete({ where: { id } })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: existing.organizationId,
          userId: user.userId,
          actor: user.email,
          action: 'project.delete',
          resource: 'project',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({ name: existing.name, code: existing.code }),
        },
      })
    } catch {}

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف المشروع' }, { status: 500 })
  }
}
