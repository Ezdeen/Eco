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

    const devices = await db.device.findMany({
      where,
      include: {
        project: { select: { name: true, nameAr: true, code: true } },
        site: { select: { name: true, nameAr: true, city: true } },
        asset: { select: { name: true } },
        _count: { select: { readings: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Health check: a device is "offline" if lastSeenAt > 6 hours ago
    const now = Date.now()
    const result = devices.map((d) => {
      const lastSeenMs = d.lastSeenAt ? d.lastSeenAt.getTime() : 0
      const isStale = now - lastSeenMs > 6 * 60 * 60 * 1000
      const effectiveStatus = d.status === 'connected' && isStale ? 'stale' : d.status
      return {
        id: d.id,
        name: d.name,
        manufacturer: d.manufacturer,
        model: d.model,
        serialNumber: d.serialNumber,
        protocol: d.protocol,
        status: effectiveStatus,
        lastSeenAt: d.lastSeenAt,
        firmwareVersion: d.firmwareVersion,
        project: d.project,
        site: d.site,
        asset: d.asset,
        readingsCount: d._count.readings,
        minutesSinceLastSeen: d.lastSeenAt ? Math.floor((now - lastSeenMs) / 60000) : null,
      }
    })

    return NextResponse.json({ devices: result, total: result.length })
  } catch (error) {
    console.error('Devices API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
