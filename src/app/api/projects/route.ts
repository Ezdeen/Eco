import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
    const body = await request.json()
    const org = await db.organization.findFirst()
    if (!org) return NextResponse.json({ error: 'No organization' }, { status: 404 })

    const project = await db.project.create({
      data: {
        organizationId: org.id,
        name: body.name,
        nameAr: body.nameAr,
        code: body.code,
        status: 'draft',
        projectType: body.projectType || 'solar_pv',
        country: body.country,
        city: body.city,
        latitude: body.latitude,
        longitude: body.longitude,
        timezone: body.timezone || 'Asia/Riyadh',
        capacityKwp: body.capacityKwp,
        currency: body.currency || 'SAR',
        tariffRetail: body.tariffRetail,
        tariffFeedIn: body.tariffFeedIn,
        methodology: body.methodology || 'ghg_protocol_scope2',
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
