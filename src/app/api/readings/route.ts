import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const metricType = searchParams.get('metricType')
    const qualityStatus = searchParams.get('qualityStatus')
    const limit = parseInt(searchParams.get('limit') || '100')
    const days = parseInt(searchParams.get('days') || '7')

    const where: any = {}
    if (projectId) where.projectId = projectId
    if (metricType) where.metricType = metricType
    if (qualityStatus) where.qualityStatus = qualityStatus
    if (days > 0) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      where.measuredAt = { gte: since }
    }

    const readings = await db.energyReading.findMany({
      where,
      include: {
        project: { select: { name: true, nameAr: true, code: true } },
        device: { select: { name: true, serialNumber: true } },
        asset: { select: { name: true } },
      },
      orderBy: { measuredAt: 'desc' },
      take: limit,
    })

    // Quality summary
    const allReadings = await db.energyReading.findMany({
      where: { projectId: projectId || undefined },
      select: { qualityStatus: true, validationStatus: true, value: true },
    })

    const qualitySummary = {
      total: allReadings.length,
      validated: allReadings.filter((r) => r.qualityStatus === 'validated').length,
      suspect: allReadings.filter((r) => r.qualityStatus === 'suspect').length,
      rejected: allReadings.filter((r) => r.qualityStatus === 'rejected').length,
      corrected: allReadings.filter((r) => r.qualityStatus === 'corrected').length,
      approved: allReadings.filter((r) => r.qualityStatus === 'approved').length,
      valid: allReadings.filter((r) => r.validationStatus === 'valid').length,
      invalid: allReadings.filter((r) => r.validationStatus === 'invalid').length,
      pending: allReadings.filter((r) => r.validationStatus === 'pending').length,
    }

    return NextResponse.json({
      readings: readings.map((r) => ({
        id: r.id,
        metricType: r.metricType,
        measuredAt: r.measuredAt,
        receivedAt: r.receivedAt,
        intervalStart: r.intervalStart,
        intervalEnd: r.intervalEnd,
        value: r.value,
        unit: r.unit,
        cumulativeValue: r.cumulativeValue,
        qualityStatus: r.qualityStatus,
        validationStatus: r.validationStatus,
        canonicalPayloadHash: r.canonicalPayloadHash,
        suspectReason: r.suspectReason,
        suspectRuleCode: r.suspectRuleCode,
        suspectSeverity: r.suspectSeverity,
        auditedAt: r.auditedAt,
        auditedBy: r.auditedBy,
        auditAction: r.auditAction,
        auditNote: r.auditNote,
        project: r.project,
        device: r.device,
        asset: r.asset,
      })),
      qualitySummary,
      total: readings.length,
    })
  } catch (error) {
    console.error('Readings API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
