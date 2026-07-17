import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/authorization'
import { ingestReadings, getIngestionBatchStatus } from '@/lib/ingestion'
import { db } from '@/lib/db'
import { ingestionSchema } from '@/lib/validation'

// POST /api/ingestion - Submit readings for ingestion
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate body with Zod
    const parsed = ingestionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'بيانات غير صالحة', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { projectId, readings, idempotencyKey, source } = parsed.data

    // Authorization: check project access
    const auth = await requireProjectAccess(projectId, 'reading:audit')
    if (!auth.authorized) return auth.response

    // Transform input to IngestReadingInput format
    const inputs = readings.map((r) => ({
      projectId,
      deviceId: r.deviceId,
      siteId: r.siteId,
      assetId: r.assetId,
      metricType: r.metricType,
      measuredAt: new Date(r.measuredAt),
      intervalStart: new Date(r.intervalStart || r.measuredAt),
      intervalEnd: r.intervalEnd ? new Date(r.intervalEnd) : undefined,
      value: typeof r.value === 'string' ? parseFloat(r.value) : r.value,
      unit: r.unit,
      cumulativeValue: r.cumulativeValue
        ? (typeof r.cumulativeValue === 'string' ? parseFloat(r.cumulativeValue) : r.cumulativeValue)
        : undefined,
      sourceEventId: r.sourceEventId,
      source: source || 'http_api',
      rawPayload: r,
    }))

    // Run ingestion pipeline
    const result = await ingestReadings(inputs, { idempotencyKey, source })

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      summary: result.summary,
      results: result.results,
    }, { status: 201 })
  } catch (error: any) {
    console.error('Ingestion API error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    )
  }
}

// GET /api/ingestion?batchId=xxx - Get batch status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const batchId = searchParams.get('batchId')

    if (batchId) {
      const batch = await getIngestionBatchStatus(batchId)
      if (!batch) {
        return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
      }
      return NextResponse.json({ batch })
    }

    // List recent batches
    const batches = await db.ingestionBatch.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { name: true, nameAr: true, code: true } },
      },
    })

    return NextResponse.json({ batches })
  } catch (error) {
    console.error('Get ingestion error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
