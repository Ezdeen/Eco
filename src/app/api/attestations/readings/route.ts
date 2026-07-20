import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/authorization'

// GET /api/attestations/readings — List individual attested readings (per-reading Hedera
// attestation via n8n + Blind Signer), not the old batch/Merkle-root system.
// Query params: projectId (optional filter), limit (default 100)
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId') || undefined
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500)

    // Scope to the user's organization unless platform_admin
    const projectWhere =
      auth.user.role === 'platform_admin'
        ? {}
        : { organizationId: auth.user.organizationId }

    const readings = await db.energyReading.findMany({
      where: {
        hederaTransactionId: { not: null },
        ...(projectId ? { projectId } : {}),
        project: projectWhere,
      },
      select: {
        id: true,
        measuredAt: true,
        canonicalPayloadHash: true,
        n8nProvidedHash: true,
        hashMatchStatus: true,
        hederaTransactionId: true,
        hederaConsensusAt: true,
        deviceId: true,
        project: { select: { id: true, name: true, nameAr: true, code: true } },
      },
      orderBy: { measuredAt: 'asc' }, // ascending so sequence numbers are chronological (1, 2, 3...)
      take: limit * 3, // fetch extra since we compute sequence per-device below, then trim after
    })

    // Compute a per-device sequence number (1, 2, 3...) in chronological order,
    // per the "الترتيب" requirement — order within the same device/project, not global.
    const sequenceCounters: Record<string, number> = {}
    const withSequence = readings.map((r) => {
      const key = r.deviceId || r.project.id
      sequenceCounters[key] = (sequenceCounters[key] || 0) + 1
      return {
        readingId: r.id,
        projectId: r.project.id,
        projectName: r.project.nameAr || r.project.name,
        projectCode: r.project.code,
        sequence: sequenceCounters[key],
        measuredAt: r.measuredAt,
        hash: r.canonicalPayloadHash,
        n8nHash: r.n8nProvidedHash,
        hashMatchStatus: r.hashMatchStatus,
        hederaTransactionId: r.hederaTransactionId,
        hederaConsensusAt: r.hederaConsensusAt,
      }
    })

    // Return most recent first for display, but sequence numbers remain chronological
    const result = withSequence.reverse().slice(0, limit)

    return NextResponse.json({ readings: result, total: withSequence.length })
  } catch (error) {
    console.error('Attestations readings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
