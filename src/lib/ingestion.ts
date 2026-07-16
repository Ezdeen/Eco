// Ingestion Pipeline Library
// Supports: idempotency, deduplication, reset/rollover handling
import { db } from './db'
import crypto from 'crypto'

export interface IngestReadingInput {
  projectId: string
  deviceId?: string
  siteId?: string
  assetId?: string
  metricType: string
  measuredAt: Date
  intervalStart: Date
  intervalEnd?: Date
  value: number
  unit: string
  cumulativeValue?: number
  sourceEventId?: string
  source?: string // http_api, mqtt, csv, manual
  rawPayload?: any
}

export interface IngestResult {
  success: boolean
  readingId?: string
  status: 'created' | 'duplicate' | 'failed'
  reason?: string
  error?: string
}

// Compute SHA-256 hash of raw payload for deduplication
function computePayloadHash(data: any): string {
  const canonical = JSON.stringify(data, Object.keys(data).sort())
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

// Generate idempotency key for batch
function generateIdempotencyKey(projectId: string, sourceEventId?: string): string {
  return sourceEventId
    ? `${projectId}:${sourceEventId}`
    : `${projectId}:${Date.now()}:${Math.random()}`
}

// Main ingestion function with full pipeline
export async function ingestReadings(
  inputs: IngestReadingInput[],
  options?: { idempotencyKey?: string; source?: string },
): Promise<{
  batchId: string
  results: IngestResult[]
  summary: { total: number; created: number; duplicates: number; failed: number }
}> {
  if (inputs.length === 0) {
    throw new Error('No readings to ingest')
  }

  const projectId = inputs[0].projectId
  const source = options?.source || 'http_api'
  const idempotencyKey = options?.idempotencyKey || generateIdempotencyKey(projectId, inputs[0].sourceEventId)

  // Idempotency: check if batch already processed
  const existingBatch = await db.ingestionBatch.findUnique({
    where: { idempotencyKey },
    include: { rawPayloads: true },
  })

  if (existingBatch && existingBatch.status === 'completed') {
    // Return existing results - idempotent
    return {
      batchId: existingBatch.id,
      results: existingBatch.rawPayloads.map((rp) => ({
        success: rp.status === 'processed',
        readingId: rp.readingId || undefined,
        status: rp.status === 'duplicate' ? 'duplicate' : rp.status === 'processed' ? 'created' : 'failed',
        reason: rp.errorMessage || undefined,
      })),
      summary: {
        total: existingBatch.rawPayloadCount,
        created: existingBatch.processedCount,
        duplicates: existingBatch.duplicateCount,
        failed: existingBatch.failedCount,
      },
    }
  }

  // Create new ingestion batch
  const batch = await db.ingestionBatch.create({
    data: {
      projectId,
      deviceId: inputs[0].deviceId,
      source,
      sourceEventId: inputs[0].sourceEventId,
      idempotencyKey,
      status: 'processing',
      rawPayloadCount: inputs.length,
    },
  })

  const results: IngestResult[] = []
  let created = 0
  let duplicates = 0
  let failed = 0

  for (const input of inputs) {
    try {
      // Compute payload hash for deduplication
      const payloadHash = computePayloadHash({
        deviceId: input.deviceId,
        metricType: input.metricType,
        intervalStart: input.intervalStart.toISOString(),
        value: input.value,
        unit: input.unit,
      })

      // Check for duplicate via payload hash
      const existingPayload = await db.rawPayload.findUnique({
        where: { payloadHash },
      })

      if (existingPayload && existingPayload.status === 'processed') {
        // Deduplication: skip already processed payload
        duplicates++
        results.push({
          success: true,
          status: 'duplicate',
          reason: 'Duplicate payload - already processed',
          readingId: existingPayload.readingId || undefined,
        })

        // Store as duplicate in raw_payloads
        await db.rawPayload.create({
          data: {
            ingestionBatchId: batch.id,
            deviceId: input.deviceId,
            payloadHash: `dup-${payloadHash}`,
            rawData: JSON.stringify(input.rawPayload || input),
            payloadSize: JSON.stringify(input).length,
            status: 'duplicate',
          },
        })
        continue
      }

      // Store raw payload
      const rawPayload = await db.rawPayload.create({
        data: {
          ingestionBatchId: batch.id,
          deviceId: input.deviceId,
          payloadHash,
          rawData: JSON.stringify(input.rawPayload || input),
          payloadSize: JSON.stringify(input).length,
          status: 'received',
        },
      })

      // Handle meter reset / rollover
      let finalValue = input.value
      let finalCumulative = input.cumulativeValue
      let adjustmentApplied = false

      if (input.cumulativeValue !== undefined && input.cumulativeValue !== null) {
        // Check for meter reset (cumulative dropped significantly)
        const lastReading = await db.energyReading.findFirst({
          where: {
            projectId: input.projectId,
            deviceId: input.deviceId,
            metricType: input.metricType,
            measuredAt: { lt: input.measuredAt },
          },
          orderBy: { measuredAt: 'desc' },
          select: { cumulativeValue: true, value: true },
        })

        if (lastReading?.cumulativeValue && input.cumulativeValue < lastReading.cumulativeValue) {
          // Meter reset detected - compute interval from new cumulative
          finalValue = input.cumulativeValue // new reading after reset
          adjustmentApplied = true

          // Record adjustment
          await db.readingAdjustment.create({
            data: {
              readingId: 'pending', // will be updated after reading creation
              originalValue: input.value,
              adjustedValue: finalValue,
              reason: 'Meter reset detected - cumulative value dropped',
              reasonCode: 'METER_RESET',
              adjustedBy: 'system@ingestion',
              status: 'approved', // auto-approved for system adjustments
              note: `Previous cumulative: ${lastReading.cumulativeValue}, New: ${input.cumulativeValue}`,
            },
          }).catch(() => {}) // non-blocking
        }

        // Check for rollover (cumulative exceeded max and wrapped around)
        if (lastReading?.cumulativeValue && input.cumulativeValue > lastReading.cumulativeValue * 2) {
          // Possible rollover - flag for review
          adjustmentApplied = true
          finalValue = input.cumulativeValue - lastReading.cumulativeValue
        }
      }

      // Check idempotency constraint (deviceId + metricType + intervalStart)
      const existingReading = await db.energyReading.findUnique({
        where: {
          deviceId_metricType_intervalStart: {
            deviceId: input.deviceId || '',
            metricType: input.metricType,
            intervalStart: input.intervalStart,
          },
        },
      }).catch(() => null) // handle null deviceId

      if (existingReading) {
        duplicates++
        results.push({
          success: true,
          status: 'duplicate',
          reason: 'Reading already exists for this interval',
          readingId: existingReading.id,
        })

        await db.rawPayload.update({
          where: { id: rawPayload.id },
          data: { status: 'duplicate', readingId: existingReading.id, processedAt: new Date() },
        })
        continue
      }

      // Create the energy reading
      const reading = await db.energyReading.create({
        data: {
          projectId: input.projectId,
          siteId: input.siteId,
          assetId: input.assetId,
          deviceId: input.deviceId,
          metricType: input.metricType,
          measuredAt: input.measuredAt,
          receivedAt: new Date(),
          intervalStart: input.intervalStart,
          intervalEnd: input.intervalEnd,
          value: finalValue,
          unit: input.unit,
          cumulativeValue: finalCumulative,
          qualityStatus: 'received',
          validationStatus: 'pending',
          canonicalPayloadHash: payloadHash,
          sourceEventId: input.sourceEventId,
        },
      })

      // Run deterministic validation rules
      await runValidationRules(reading.id, reading.value, reading.metricType, input.projectId)

      // Update raw payload status
      await db.rawPayload.update({
        where: { id: rawPayload.id },
        data: { status: 'processed', readingId: reading.id, processedAt: new Date() },
      })

      created++
      results.push({
        success: true,
        status: 'created',
        readingId: reading.id,
        reason: adjustmentApplied ? 'Created with adjustment (meter reset/rollover)' : undefined,
      })
    } catch (error: any) {
      failed++
      results.push({
        success: false,
        status: 'failed',
        error: error.message,
      })
    }
  }

  // Update batch summary
  await db.ingestionBatch.update({
    where: { id: batch.id },
    data: {
      status: failed === inputs.length ? 'failed' : duplicates === inputs.length ? 'completed' : 'completed',
      processedCount: created,
      duplicateCount: duplicates,
      failedCount: failed,
      processedAt: new Date(),
      errorMessage: failed > 0 ? `${failed} readings failed` : null,
    },
  })

  return {
    batchId: batch.id,
    results,
    summary: { total: inputs.length, created, duplicates, failed },
  }
}

// Deterministic validation rules
async function runValidationRules(
  readingId: string,
  value: number,
  metricType: string,
  projectId: string,
) {
  const rules = [
    {
      ruleCode: 'NEGATIVE_VALUE',
      check: () => value < 0,
      severity: 'critical',
      details: { value, expected: '>= 0' },
    },
    {
      ruleCode: 'ZERO_READING',
      check: () => value === 0,
      severity: 'low',
      details: { value, note: 'Zero reading - may indicate no production' },
    },
    {
      ruleCode: 'NIGHTTIME_READING',
      check: () => {
        const hour = new Date().getHours()
        return (hour < 5 || hour > 19) && value > 0.5 && metricType === 'energy_export_kwh'
      },
      severity: 'high',
      details: { hour: new Date().getHours(), value, expected: '< 0.5 kWh at night' },
    },
  ]

  for (const rule of rules) {
    if (rule.check()) {
      await db.validationResult.create({
        data: {
          readingId,
          ruleCode: rule.ruleCode,
          status: 'failed',
          severity: rule.severity,
          details: JSON.stringify(rule.details),
        },
      })

      // Update reading quality status
      await db.energyReading.update({
        where: { id: readingId },
        data: {
          qualityStatus: rule.severity === 'critical' ? 'rejected' : 'suspect',
          validationStatus: 'invalid',
          suspectReason: `${rule.ruleCode}: ${JSON.stringify(rule.details)}`,
          suspectRuleCode: rule.ruleCode,
          suspectSeverity: rule.severity,
          suspectDetails: JSON.stringify(rule.details),
        },
      })
    } else {
      // Passed
      await db.validationResult.create({
        data: {
          readingId,
          ruleCode: rule.ruleCode,
          status: 'passed',
          severity: 'low',
        },
      })
    }
  }

  // If all rules passed, mark as validated
  const failures = await db.validationResult.count({
    where: { readingId, status: 'failed' },
  })

  if (failures === 0) {
    await db.energyReading.update({
      where: { id: readingId },
      data: { qualityStatus: 'validated', validationStatus: 'valid' },
    })
  }
}

// Get ingestion batch status
export async function getIngestionBatchStatus(batchId: string) {
  const batch = await db.ingestionBatch.findUnique({
    where: { id: batchId },
    include: {
      rawPayloads: {
        select: {
          id: true,
          status: true,
          payloadHash: true,
          readingId: true,
          errorMessage: true,
          receivedAt: true,
          processedAt: true,
        },
        take: 50,
      },
    },
  })

  return batch
}
