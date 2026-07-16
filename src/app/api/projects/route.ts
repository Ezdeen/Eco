import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const projects = await db.project.findMany({
      where: status ? { status } : undefined,
      include: {
        sites: true,
        assets: { include: { solarProfile: true } },
        devices: true,
        _count: { select: { readings: true, cases: true, attestations: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = projects.map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr,
      code: p.code,
      status: p.status,
      projectType: p.projectType,
      country: p.country,
      city: p.city,
      latitude: p.latitude,
      longitude: p.longitude,
      timezone: p.timezone,
      commissionedAt: p.commissionedAt,
      capacityKwp: p.capacityKwp,
      currency: p.currency,
      tariffRetail: p.tariffRetail,
      tariffFeedIn: p.tariffFeedIn,
      methodology: p.methodology,
      sponsorName: p.sponsorName,
      sponsorPhone: p.sponsorPhone,
      inverterSerial: p.inverterSerial,
      inverterType: p.inverterType,
      sitesCount: p.sites.length,
      assetsCount: p.assets.length,
      devicesCount: p.devices.length,
      readingsCount: p._count.readings,
      casesCount: p._count.cases,
      attestationsCount: p._count.attestations,
      createdAt: p.createdAt,
    }))

    return NextResponse.json({ projects: result, total: result.length })
  } catch (error) {
    console.error('Projects API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
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
      projectType,
      timezone,
      tariffRetail,
      tariffFeedIn,
    } = body

    // Validate required fields
    if (!name || !code) {
      return NextResponse.json(
        { error: 'اسم المشروع والرمز مطلوبان' },
        { status: 400 },
      )
    }

    if (!inverterSerial) {
      return NextResponse.json(
        { error: 'سيريال نمبر الإنفرتر مطلوب' },
        { status: 400 },
      )
    }

    if (!country || !city) {
      return NextResponse.json(
        { error: 'الدولة والمدينة مطلوبان' },
        { status: 400 },
      )
    }

    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'إحداثيات الطول والعرض مطلوبة' },
        { status: 400 },
      )
    }

    const org = await db.organization.findFirst({
      where: { id: user.organizationId },
    })
    if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 })

    // Check code uniqueness within organization
    const existing = await db.project.findFirst({
      where: { organizationId: org.id, code },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'رمز المشروع مستخدم بالفعل في المؤسسة' },
        { status: 409 },
      )
    }

    // Check inverter serial uniqueness
    const existingInverter = await db.project.findFirst({
      where: { inverterSerial },
    })
    if (existingInverter) {
      return NextResponse.json(
        { error: 'سيريال نمبر الإنفرتر مستخدم في مشروع آخر' },
        { status: 409 },
      )
    }

    // Create project
    const project = await db.project.create({
      data: {
        organizationId: org.id,
        name,
        nameAr: nameAr || name,
        code,
        status: 'draft',
        projectType: projectType || 'solar_pv',
        country,
        city,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        timezone: timezone || 'Asia/Riyadh',
        capacityKwp: capacityKwp ? parseFloat(capacityKwp) : null,
        currency: currency || 'SAR',
        tariffRetail: tariffRetail ? parseFloat(tariffRetail) : null,
        tariffFeedIn: tariffFeedIn ? parseFloat(tariffFeedIn) : null,
        methodology: 'ghg_protocol_scope2',
        sponsorName: sponsorName || null,
        sponsorPhone: sponsorPhone || null,
        inverterSerial,
        inverterType: inverterType || 'string',
      },
    })

    // Create a default site
    const site = await db.site.create({
      data: {
        projectId: project.id,
        name: `${name} - الموقع الرئيسي`,
        nameAr: `${nameAr || name} - الموقع الرئيسي`,
        country,
        city,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        timezone: timezone || 'Asia/Riyadh',
      },
    })

    // Create default asset (solar array)
    const asset = await db.asset.create({
      data: {
        projectId: project.id,
        siteId: site.id,
        name: `${code} Array A`,
        assetType: 'solar_array',
        status: 'active',
      },
    })

    if (capacityKwp) {
      await db.solarAssetProfile.create({
        data: {
          assetId: asset.id,
          capacityKwp: parseFloat(capacityKwp),
          panelAreaM2: parseFloat(capacityKwp) * 5,
          tiltDegrees: 25,
          azimuthDegrees: 180,
          technology: 'mono_si',
          moduleEfficiency: 0.21,
          systemLosses: 0.14,
          inverterEfficiency: 0.97,
        },
      })
    }

    // Register the device (inverter)
    await db.device.create({
      data: {
        projectId: project.id,
        siteId: site.id,
        assetId: asset.id,
        name: `${code}-INV-001`,
        manufacturer: 'Generic',
        model: 'Inverter',
        serialNumber: inverterSerial,
        protocol: 'http_api',
        status: 'registered',
      },
    })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          userId: user.userId,
          actor: user.email,
          action: 'project.create',
          resource: 'project',
          resourceId: project.id,
          result: 'success',
          metadata: JSON.stringify({ code, name }),
        },
      })
    } catch {}

    return NextResponse.json(
      { success: true, project },
      { status: 201 },
    )
  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إنشاء المشروع' }, { status: 500 })
  }
}
