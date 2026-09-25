import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('project:read')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const assets = await db.asset.findMany({
      where,
      include: {
        solarProfile: true,
        site: { select: { name: true, nameAr: true, city: true } },
        project: { select: { name: true, nameAr: true, code: true, inverterType: true } },
        devices: { select: { id: true, name: true, status: true, lastSeenAt: true, serialNumber: true } },
        _count: { select: { readings: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      assets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        assetType: a.assetType,
        status: a.status,
        project: a.project,
        site: a.site,
        solarProfile: a.solarProfile,
        devices: a.devices,
        readingsCount: a._count.readings,
        createdAt: a.createdAt,
        capacityKwp: a.solarProfile?.capacityKwp,
        technology: a.solarProfile?.technology,
        moduleEfficiency: a.solarProfile?.moduleEfficiency,
        tiltDegrees: a.solarProfile?.tiltDegrees,
        azimuthDegrees: a.solarProfile?.azimuthDegrees,
      })),
      total: assets.length,
    })
  } catch (error) {
    console.error('Assets API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
