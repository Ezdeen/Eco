import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ingestReadings } from '@/lib/ingestion'
import { verifyHmacSignature, isReplayAttack } from '@/lib/crypto'
import crypto from 'crypto'

// POST /api/webhooks/n8n — Secure endpoint for n8n encrypted data ingestion
// Headers required:
//   x-n8n-signature: HMAC-SHA256 signature of the payload
//   x-n8n-timestamp: Unix timestamp (ms) for replay protection
//   x-n8n-event-id: Unique event ID for idempotency
//   x-source-id: Source identifier (e.g., device serial or project code)

export async function POST(request: NextRequest) {
  try {
    // 1. Extract headers
    const signature = request.headers.get('x-n8n-signature')
    const timestamp = request.headers.get('x-n8n-timestamp')
    const eventId = request.headers.get('x-n8n-event-id')
    const sourceId = request.headers.get('x-source-id')

    if (!signature || !timestamp || !eventId) {
      return NextResponse.json(
        { error: 'Missing required headers: x-n8n-signature, x-n8n-timestamp, x-n8n-event-id' },
        { status: 400 },
      )
    }

    // 2. Replay attack check
    if (isReplayAttack(timestamp)) {
      return NextResponse.json(
        { error: 'Replay attack detected: timestamp outside 5-minute window' },
        { status: 401 },
      )
    }

    // 3. Get raw body
    const rawBody = await request.text()

    // 4. Verify HMAC signature
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET || 'n8n-webhook-default-secret'
    if (!verifyHmacSignature(rawBody, signature, webhookSecret)) {
      // Log failed attempt
      await db.webhookEvent.create({
        data: {
          source: 'n8n',
          eventId,
          signature,
          timestamp: new Date(parseInt(timestamp)),
          sourceId,
          payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
          status: 'failed',
          errorMessage: 'HMAC signature verification failed',
        },
      }).catch(() => {})

      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 },
      )
    }

    // 5. Idempotency check — has this event been processed?
    const existingEvent = await db.webhookEvent.findUnique({
      where: { eventId },
    })

    if (existingEvent && existingEvent.status === 'processed') {
      return NextResponse.json({
        success: true,
        message: 'Event already processed (idempotent)',
        eventId,
        status: 'duplicate',
      })
    }

    // 6. Parse payload
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      await db.webhookEvent.create({
        data: {
          source: 'n8n', eventId, signature, timestamp: new Date(parseInt(timestamp)),
          sourceId, status: 'failed', errorMessage: 'Invalid JSON payload',
        },
      }).catch(() => {})

      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // 7. Create webhook event record
    const webhookEvent = await db.webhookEvent.create({
      data: {
        source: 'n8n',
        eventId,
        eventType: payload.eventType || 'reading_ingest',
        signature,
        timestamp: new Date(parseInt(timestamp)),
        sourceId,
        payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
        status: 'received',
        payload: rawBody,
      },
    })

    // 8. Transform and ingest readings
    const { projectId, readings } = payload

    if (!projectId || !readings || !Array.isArray(readings)) {
      await db.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { status: 'failed', errorMessage: 'Missing projectId or readings in payload' },
      })

      return NextResponse.json(
        { error: 'Payload must include projectId and readings[]' },
        { status: 400 },
      )
    }

    // Transform n8n payload to IngestReadingInput format
    const inputs = readings.map((r: any) => ({
      projectId,
      deviceId: r.deviceId,
      siteId: r.siteId,
      assetId: r.assetId,
      metricType: r.metricType || 'energy_export_kwh',
      measuredAt: new Date(r.measuredAt),
      intervalStart: new Date(r.intervalStart || r.measuredAt),
      intervalEnd: r.intervalEnd ? new Date(r.intervalEnd) : undefined,
      value: parseFloat(r.value),
      unit: r.unit || 'kWh',
      cumulativeValue: r.cumulativeValue ? parseFloat(r.cumulativeValue) : undefined,
      sourceEventId: eventId,
      source: 'n8n_webhook',
      rawPayload: r,
    }))

    // 9. Run ingestion pipeline
    const result = await ingestReadings(inputs, {
      idempotencyKey: `n8n:${eventId}`,
      source: 'n8n_webhook',
    })

    // 10. Update webhook event status
    await db.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: 'processed',
        ingestionBatchId: result.batchId,
        processedAt: new Date(),
      },
    })

    // 11. Log audit
    try {
      await db.auditEvent.create({
        data: {
          actor: `n8n:${sourceId || 'unknown'}`,
          action: 'webhook.n8n.ingest',
          resource: 'webhook_event',
          resourceId: webhookEvent.id,
          result: 'success',
          metadata: JSON.stringify({
            eventId,
            projectId,
            readingsCount: readings.length,
            batchId: result.batchId,
            created: result.summary.created,
            duplicates: result.summary.duplicates,
            failed: result.summary.failed,
          }),
        },
      })
    } catch {}

    return NextResponse.json({
      success: true,
      eventId,
      batchId: result.batchId,
      summary: result.summary,
    }, { status: 201 })

  } catch (error: any) {
    console.error('n8n webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    )
  }
}

// GET /api/webhooks/n8n — List recent webhook events (for admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '20')

    const events = await db.webhookEvent.findMany({
      where: status ? { status } : undefined,
      take: limit,
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        source: true,
        eventId: true,
        eventType: true,
        sourceId: true,
        status: true,
        errorMessage: true,
        receivedAt: true,
        processedAt: true,
      },
    })

    const stats = {
      total: await db.webhookEvent.count(),
      processed: await db.webhookEvent.count({ where: { status: 'processed' } }),
      failed: await db.webhookEvent.count({ where: { status: 'failed' } }),
      duplicate: await db.webhookEvent.count({ where: { status: 'duplicate' } }),
    }

    return NextResponse.json({ events, stats })
  } catch (error) {
    console.error('Webhook events list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
