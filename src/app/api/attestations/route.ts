import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, projectScopeFilter } from '@/lib/authorization'
import { computeBatchHash, computeMerkleRoot, createOutboxEvent, submitAttestation } from '@/lib/hedera'
import { attestationSchema } from '@/lib/validation'

export async function GET(request: NextRequest) {
  try {
    // Security: this endpoint had NO authentication check at all — any anonymous
    // visitor could list attestation batches (including hashes and Hedera transaction
    // IDs) from every organization on the platform.
    const auth = await requirePermission('project:read')
    if (!auth.authorized) return auth.response
    const { user } = auth

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')

    const where: any = {
      project: { organizationId: user.organizationId!, ...projectScopeFilter(user) },
    }
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
    // Authorization
    const auth = await requirePermission('attestation:submit')
    if (!auth.authorized) return auth.response

    const body = await request.json()

    // Validate body with Zod
    const parsed = attestationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { projectId, readings, methodologyVersion } = parsed.data

    // Build canonical payload using sorted keys for consistency
    const canonicalPayload = {
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
    }

    // === PRIORITY 2: Use computeBatchHash from hedera.ts ===
    const batchHash = computeBatchHash(canonicalPayload)

    // === PRIORITY 2: Use computeMerkleRoot from hedera.ts ===
    const leaves = readings.map((r: any) => r.canonicalPayloadHash || r.id)
    const merkleRoot = computeMerkleRoot(leaves)

    const payloadSummary = {
      readingsCount: readings.length,
      period: {
        start: readings[0]?.intervalStart,
        end: readings[readings.length - 1]?.intervalStart,
      },
      methodologyVersion: methodologyVersion || 'ghg_protocol_scope2_v1.2',
    }

    // === PRIORITY 2: Create attestation as "pending" - NOT confirmed yet ===
    const attestation = await db.attestationBatch.create({
      data: {
        projectId,
        batchHash,
        merkleRoot,
        status: 'pending', // CRITICAL: start as pending, not confirmed
        payloadSummary: JSON.stringify(payloadSummary),
        itemCount: readings.length,
        submittedAt: new Date(),
      },
      include: { project: { select: { name: true, nameAr: true, code: true } } },
    })

    // === PRIORITY 2: Create outbox event for async Hedera submission ===
    const outboxEventId = await createOutboxEvent('attestation_submit', {
      attestationBatchId: attestation.id,
      batchHash,
      merkleRoot,
      payloadSummary,
    })

    // Try immediate submission
    const result = await submitAttestation(batchHash, merkleRoot, payloadSummary)

    if (result.success) {
      // === PRIORITY 2: Only mark confirmed after actual outbox submission ===
      await db.attestationBatch.update({
        where: { id: attestation.id },
        data: {
          status: result.isProductionEvidence ? 'confirmed' : 'submitted', // simulation = submitted, not confirmed
          hederaTransactionId: result.transactionId,
          consensusTimestamp: result.consensusTimestamp,
          confirmedAt: result.isProductionEvidence ? new Date() : null,
        },
      })

      // Update outbox event
      await db.outboxEvent.update({
        where: { id: outboxEventId },
        data: {
          status: 'confirmed',
          hederaTransactionId: result.transactionId,
          consensusTimestamp: result.consensusTimestamp,
          processedAt: new Date(),
        },
      })
    } else {
      // Submission failed - keep as pending, outbox will retry
      await db.attestationBatch.update({
        where: { id: attestation.id },
        data: { status: 'pending' },
      })
    }

    const updated = await db.attestationBatch.findUnique({
      where: { id: attestation.id },
      include: { project: { select: { name: true, nameAr: true, code: true } } },
    })

    return NextResponse.json({
      success: true,
      attestation: updated,
      batchHash,
      merkleRoot,
      hederaTransactionId: result.transactionId,
      consensusTimestamp: result.consensusTimestamp,
      mode: result.mode,
      isProductionEvidence: result.isProductionEvidence,
      topicId: result.topicId,
      warning: result.isProductionEvidence
        ? undefined
        : '⚠️ هذه توثيق محاكاة (simulation) وليس دليلاً إنتاجيًا. للتوثيق الإنتاجي، أضف بيانات حساب Hedera الحقيقية من قسم التكاملات → إدارة الإعدادات',
    }, { status: 201 })
  } catch (error) {
    console.error('Create attestation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
