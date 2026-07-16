import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

interface Params {
  params: Promise<{ id: string }>
}

// GET - fetch detailed audit info for a reading
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const reading = await db.energyReading.findUnique({
      where: { id },
      include: {
        project: { select: { name: true, nameAr: true, code: true, capacityKwp: true } },
        device: { select: { name: true, serialNumber: true, status: true, lastSeenAt: true } },
        asset: { select: { name: true, solarProfile: true } },
      },
    })

    if (!reading) {
      return NextResponse.json({ error: 'القراءة غير موجودة' }, { status: 404 })
    }

    // Build detailed audit report
    const auditReport: any = {
      reading: {
        id: reading.id,
        metricType: reading.metricType,
        measuredAt: reading.measuredAt,
        receivedAt: reading.receivedAt,
        intervalStart: reading.intervalStart,
        intervalEnd: reading.intervalEnd,
        value: reading.value,
        unit: reading.unit,
        cumulativeValue: reading.cumulativeValue,
        qualityStatus: reading.qualityStatus,
        validationStatus: reading.validationStatus,
        canonicalPayloadHash: reading.canonicalPayloadHash,
      },
      project: reading.project,
      device: reading.device,
      asset: reading.asset,
      audit: {
        suspectReason: reading.suspectReason,
        suspectRuleCode: reading.suspectRuleCode,
        suspectSeverity: reading.suspectSeverity,
        suspectDetails: reading.suspectDetails ? JSON.parse(reading.suspectDetails) : null,
        auditedAt: reading.auditedAt,
        auditedBy: reading.auditedBy,
        auditAction: reading.auditAction,
        auditNote: reading.auditNote,
      },
    }

    // If no reason stored, generate one based on rules
    if (!reading.suspectReason && (reading.qualityStatus === 'suspect' || reading.qualityStatus === 'rejected')) {
      const generated = generateReasonFromRules(reading)
      auditReport.audit.suspectReason = generated.reason
      auditReport.audit.suspectRuleCode = generated.ruleCode
      auditReport.audit.suspectSeverity = generated.severity
      auditReport.audit.suspectDetails = generated.details
      auditReport.audit.generated = true // flag that this was auto-generated
    }

    // Get context readings (surrounding readings for comparison)
    const contextReadings = await db.energyReading.findMany({
      where: {
        projectId: reading.projectId,
        metricType: reading.metricType,
        measuredAt: {
          gte: new Date(reading.measuredAt.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(reading.measuredAt.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { measuredAt: true, value: true, qualityStatus: true },
      orderBy: { measuredAt: 'asc' },
      take: 50,
    })
    auditReport.contextReadings = contextReadings

    // Calculate statistics
    const validReadings = contextReadings.filter((r) => r.qualityStatus === 'validated')
    if (validReadings.length > 0) {
      const values = validReadings.map((r) => r.value)
      const avg = values.reduce((s, v) => s + v, 0) / values.length
      const max = Math.max(...values)
      const min = Math.min(...values)
      const stdDev = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length)

      auditReport.statistics = {
        average: Math.round(avg * 100) / 100,
        max: Math.round(max * 100) / 100,
        min: Math.round(min * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        sampleSize: values.length,
        deviation: reading.value > avg ? Math.round(((reading.value - avg) / avg) * 100 * 10) / 10 : Math.round(((avg - reading.value) / avg) * 100 * 10) / 10,
        isOutlier: reading.value > avg + 3 * stdDev || reading.value < avg - 3 * stdDev,
      }
    }

    return NextResponse.json(auditReport)
  } catch (error) {
    console.error('Reading audit GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - submit audit note (READ-ONLY: only adds reviewer note, does NOT change reading status)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const body = await request.json()
    const { note } = body

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json(
        { error: 'ملاحظة المدقق مطلوبة' },
        { status: 400 },
      )
    }

    if (note.length > 1000) {
      return NextResponse.json(
        { error: 'الملاحظة طويلة جدًا (الحد الأقصى 1000 حرف)' },
        { status: 400 },
      )
    }

    const existing = await db.energyReading.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'القراءة غير موجودة' }, { status: 404 })
    }

    // READ-ONLY: only add audit note, do NOT change qualityStatus or validationStatus
    // The reading's status remains exactly as it was (suspect/rejected/validated)
    // The auditor can only add their observations
    const updated = await db.energyReading.update({
      where: { id },
      data: {
        auditedAt: new Date(),
        auditedBy: user.email,
        auditAction: 'reviewed', // action is always "reviewed" - just an observation
        auditNote: note.trim(),
        // qualityStatus and validationStatus are NOT modified - read-only audit
      },
    })

    // Log audit event
    try {
      await db.auditEvent.create({
        data: {
          organizationId: user.organizationId,
          projectId: existing.projectId,
          userId: user.userId,
          actor: user.email,
          action: 'reading.audit.note',
          resource: 'energy_reading',
          resourceId: id,
          result: 'success',
          metadata: JSON.stringify({
            statusUnchanged: true,
            qualityStatus: existing.qualityStatus,
            note: note.slice(0, 200),
          }),
        },
      })
    } catch {}

    return NextResponse.json({
      success: true,
      reading: updated,
      message: 'تم حفظ ملاحظة المدقيق - لم يتم تغيير حالة القراءة (للقراءة فقط)',
    })
  } catch (error) {
    console.error('Reading audit PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper: generate reason from rules when not stored
function generateReasonFromRules(reading: any) {
  const hour = new Date(reading.measuredAt).getHours()
  const value = reading.value
  const isNighttime = hour < 5 || hour > 19

  if (isNighttime && value > 0.5) {
    return {
      reason: 'قراءة في ساعة غير نهارية مع قيمة إنتاج كبيرة - غير منطقي فيزيائيًا',
      ruleCode: 'NIGHTTIME_PRODUCTION',
      severity: 'critical',
      details: { hour, value, expectedMax: 0.1, message: 'لا يوجد إشعاع شمسي في هذه الساعة' },
    }
  }

  if (value < 0) {
    return {
      reason: 'قيمة سالبة لمقياس إنتاج - غير ممكن فيزيائيًا',
      ruleCode: 'NEGATIVE_VALUE',
      severity: 'critical',
      details: { value, expectedMin: 0 },
    }
  }

  if (reading.cumulativeValue !== null && reading.cumulativeValue !== undefined) {
    return {
      reason: 'احتمال وجود قفزة أو انخفاض في القيمة التراكمية',
      ruleCode: 'CUMULATIVE_ANOMALY',
      severity: 'high',
      details: { cumulative: reading.cumulativeValue, value: reading.value },
    }
  }

  return {
    reason: 'القيمة تتجاوز النطاق المتوقع وفق القواعد الإحصائية',
    ruleCode: 'OUT_OF_RANGE',
    severity: 'medium',
    details: { value: reading.value },
  }
}
