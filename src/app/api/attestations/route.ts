import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const attestations = await db.attestationBatch.findMany({
      where,
      include: {
        project: { select: { name: true, nameAr: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Stats
    const stats = {
      total: attestations.length,
      confirmed: attestations.filter((a) => a.status === 'confirmed').length,
      pending: attestations.filter((a) => a.status === 'pending').length,
      failed: attestations.filter((a) => a.status === 'failed').length,
      mismatch: attestations.filter((a) => a.status === 'mismatch').length,
      totalItems: attestations.reduce((s, a) => s + a.itemCount, 0),
    }

    // Additional attestation-specific stats
    const confirmedAttestations = attestations.filter((a) => a.status === 'confirmed')
    const lastAttestation = attestations[0] // most recent
    const lastConsensusTimestamp = confirmedAttestations
      .sort((a, b) => (b.confirmedAt?.getTime() || 0) - (a.confirmedAt?.getTime() || 0))[0]?.consensusTimestamp

    // Count unattested readings (readings without attestation in their project)
    const projectIds = [...new Set(attestations.map((a) => a.projectId))]
    const totalReadings = await db.energyReading.count()
    const attestedReadingsCount = attestations
      .filter((a) => a.status === 'confirmed')
      .reduce((s, a) => s + a.itemCount, 0)
    const unattestedReadings = Math.max(0, totalReadings - attestedReadingsCount)

    // Count attestation batches (confirmed vs unattested)
    const attestedBatches = stats.confirmed
    const unattestedBatches = stats.pending + stats.failed

    // Count retries (estimated from audit events)
    const retryCount = await db.auditEvent.count({
      where: { action: { contains: 'retry' } },
    })

    // Count mismatches
    const mismatchCount = stats.mismatch

    // Count approved and under-review reports
    const approvedReports = await db.report.count({ where: { status: 'published' } })
    const underReviewReports = await db.report.count({ where: { status: 'under_review' } })

    // Latest methodology and emission factor versions
    const latestMethodology = 'ghg_protocol_scope2_v1.2'
    const latestEmissionFactor = '0.432 kgCO₂e/kWh (Saudi Grid - 2024)'

    // Hedera network status
    const hederaStatus = confirmedAttestations.length > 0 ? 'connected' : 'disconnected'

    const extendedStats = {
      ...stats,
      // New required stats
      attestedBatches,
      unattestedBatches,
      unattestedReadings,
      hederaStatus,
      lastAttestation: lastAttestation
        ? {
            id: lastAttestation.id,
            project: lastAttestation.project,
            status: lastAttestation.status,
            confirmedAt: lastAttestation.confirmedAt,
            itemCount: lastAttestation.itemCount,
            hederaTransactionId: lastAttestation.hederaTransactionId,
          }
        : null,
      lastConsensusTimestamp,
      retryCount,
      mismatchCount,
      approvedReports,
      underReviewReports,
      latestMethodology,
      latestEmissionFactor,
    }

    return NextResponse.json({
      attestations: attestations.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        project: a.project,
        batchHash: a.batchHash,
        merkleRoot: a.merkleRoot,
        status: a.status,
        hederaTransactionId: a.hederaTransactionId,
        consensusTimestamp: a.consensusTimestamp,
        payloadSummary: a.payloadSummary,
        itemCount: a.itemCount,
        createdAt: a.createdAt,
        submittedAt: a.submittedAt,
        confirmedAt: a.confirmedAt,
      })),
      stats: extendedStats,
    })
  } catch (error) {
    console.error('Attestations API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, readings, methodologyVersion } = body

    if (!projectId || !readings || !Array.isArray(readings) || readings.length === 0) {
      return NextResponse.json({ error: 'projectId and readings[] are required' }, { status: 400 })
    }

    // Build canonical payload
    const canonicalPayload = JSON.stringify({
      projectId,
      methodologyVersion: methodologyVersion || 'ghg_protocol_scope2_v1.2',
      generatedAt: new Date().toISOString(),
      readings: readings.map((r: any) => ({
        id: r.id,
        metricType: r.metricType,
        intervalStart: r.intervalStart,
        value: r.value,
        unit: r.unit,
        hash: r.canonicalPayloadHash,
      })),
    })

    // Compute SHA-256 (simplified - in production use Web Crypto API on server)
    const crypto = await import('crypto')
    const batchHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex')

    // Generate Merkle root (simplified - root of leaves)
    const leaves = readings.map((r: any) => r.canonicalPayloadHash || r.id)
    let level = leaves
    while (level.length > 1) {
      const next: string[] = []
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]
        const right = level[i + 1] || left
        next.push(crypto.createHash('sha256').update(left + right).digest('hex'))
      }
      level = next
    }
    const merkleRoot = level[0] || batchHash

    // Simulate Hedera transaction
    const hederaTransactionId = `0.0.${Math.floor(Math.random() * 1000000)}-${Math.floor(Date.now() / 1000)}-${Math.floor(Math.random() * 100000)}`
    const consensusTimestamp = `${Math.floor(Date.now() / 1000)}.000000000`

    const attestation = await db.attestationBatch.create({
      data: {
        projectId,
        batchHash: `0x${batchHash}`,
        merkleRoot: `0x${merkleRoot}`,
        status: 'confirmed',
        hederaTransactionId,
        consensusTimestamp,
        payloadSummary: JSON.stringify({
          readingsCount: readings.length,
          period: {
            start: readings[0]?.intervalStart,
            end: readings[readings.length - 1]?.intervalStart,
          },
          methodologyVersion: methodologyVersion || 'ghg_protocol_scope2_v1.2',
        }),
        itemCount: readings.length,
        submittedAt: new Date(),
        confirmedAt: new Date(),
      },
      include: { project: { select: { name: true, nameAr: true, code: true } } },
    })

    return NextResponse.json({
      success: true,
      attestation,
      canonicalPayloadHash: `0x${batchHash}`,
      merkleRoot: `0x${merkleRoot}`,
      hederaTransactionId,
      consensusTimestamp,
    })
  } catch (error) {
    console.error('Create attestation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
