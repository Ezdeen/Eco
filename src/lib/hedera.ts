// Hedera Integration Library
// Uses Hedera SDK for real blockchain attestation with outbox/retry/reconciliation
import { db } from './db'
import crypto from 'crypto'

// Hedera client configuration
// In production, use environment variables for operator credentials
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'simulation'
const HEDERA_OPERATOR_ID = process.env.HEDERA_OPERATOR_ID || ''
const HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY || ''
const HEDERA_TOPIC_ID = process.env.HEDERA_TOPIC_ID || '' // Required for attestation topic

// === PRIORITY 6: Block simulation in production ===
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
// During build, Next.js runs in production mode but we shouldn't throw
const IS_BUILD_TIME = !!process.env.NEXT_PRIVATE_BUILD_ID || process.env.NEXT_PHASE === 'phase-production-build'

if (IS_PRODUCTION && !IS_BUILD_TIME && HEDERA_NETWORK === 'simulation') {
  throw new Error(
    'FATAL: HEDERA_NETWORK=simulation is NOT allowed in production. ' +
    'Set HEDERA_NETWORK to testnet or mainnet, and configure HEDERA_OPERATOR_ID, ' +
    'HEDERA_OPERATOR_KEY, and HEDERA_TOPIC_ID.'
  )
}

if (IS_PRODUCTION && !IS_BUILD_TIME && (HEDERA_NETWORK === 'testnet' || HEDERA_NETWORK === 'mainnet')) {
  if (!HEDERA_OPERATOR_ID || !HEDERA_OPERATOR_KEY || !HEDERA_TOPIC_ID) {
    throw new Error(
      'FATAL: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, and HEDERA_TOPIC_ID are required ' +
      `when HEDERA_NETWORK=${HEDERA_NETWORK} in production.`
    )
  }
}

// Log Hedera configuration status at startup
console.log(`[Hedera] Network: ${HEDERA_NETWORK}, Mode: ${IS_PRODUCTION ? 'production' : 'development'}, ` +
  `Operator: ${HEDERA_OPERATOR_ID ? 'configured' : 'NOT configured'}, ` +
  `Topic: ${HEDERA_TOPIC_ID ? 'configured' : 'NOT configured'}`)

// Check if Hedera SDK is available (real vs mock)
let hederaClient: any = null

async function getHederaClient() {
  if (hederaClient) return hederaClient

  try {
    // Dynamic import to avoid issues if SDK not configured
    const { Client, PrivateKey, AccountId } = await import('@hashgraph/sdk')

    if (HEDERA_NETWORK === 'mainnet') {
      hederaClient = Client.forMainnet()
    } else {
      hederaClient = Client.forTestnet()
    }

    // Only set operator if real credentials provided
    if (HEDERA_OPERATOR_KEY && HEDERA_OPERATOR_KEY.length > 30) {
      const operatorId = AccountId.fromString(HEDERA_OPERATOR_ID)
      const operatorKey = PrivateKey.fromString(HEDERA_OPERATOR_KEY)
      hederaClient.setOperator(operatorId, operatorKey)
      return { client: hederaClient, mode: 'live' as const }
    }

    return { client: null, mode: 'simulation' as const }
  } catch (error) {
    console.error('Hedera SDK initialization failed, falling back to simulation:', error)
    return { client: null, mode: 'simulation' as const }
  }
}

// Compute SHA-256 hash of canonical payload
export function computeBatchHash(payload: any): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort())
  return '0x' + crypto.createHash('sha256').update(canonical).digest('hex')
}

// Compute Merkle Root from leaf hashes
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return '0x' + crypto.createHash('sha256').update('').digest('hex')
  if (leaves.length === 1) return leaves[0]

  let level = leaves
  while (level.length > 1) {
    const next: string[] = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]
      const right = level[i + 1] || level[i]
      const combined = crypto.createHash('sha256').update(left + right).digest('hex')
      next.push('0x' + combined)
    }
    level = next
  }
  return level[0]
}

// Submit attestation to Hedera (or simulate if no real credentials)
export async function submitAttestation(
  batchHash: string,
  merkleRoot: string,
  payloadSummary: any,
): Promise<{
  success: boolean
  transactionId?: string
  consensusTimestamp?: string
  error?: string
  mode: 'live' | 'simulation'
  topicId?: string
  isProductionEvidence: boolean
}> {
  const { client, mode } = await getHederaClient()

  if (mode === 'live' && client) {
    if (!HEDERA_TOPIC_ID) {
      return {
        success: false,
        error: 'HEDERA_TOPIC_ID not configured. Cannot submit to topic.',
        mode: 'live',
        isProductionEvidence: false,
      }
    }

    try {
      const { TopicMessageSubmitTransaction, TopicId } = await import('@hashgraph/sdk')

      const message = JSON.stringify({
        batchHash,
        merkleRoot,
        timestamp: new Date().toISOString(),
        ...payloadSummary,
      })

      const transaction = await new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(HEDERA_TOPIC_ID))
        .setMessage(message)
        .execute(client)

      const receipt = await transaction.getReceipt(client)

      return {
        success: true,
        transactionId: transaction.transactionId?.toString() || 'unknown',
        consensusTimestamp: (receipt as any).consensusTimestamp
          ? `${(receipt as any).consensusTimestamp.seconds}.${(receipt as any).consensusTimestamp.nanos}`
          : new Date().toISOString(),
        mode: 'live',
        topicId: HEDERA_TOPIC_ID,
        isProductionEvidence: true,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        mode: 'live',
        topicId: HEDERA_TOPIC_ID,
        isProductionEvidence: false,
      }
    }
  }

  // Simulation mode (for development/testing)
  const simulatedTxId = `0.0.${Math.floor(Math.random() * 1000000)}-${Math.floor(Date.now() / 1000)}-${Math.floor(Math.random() * 100000)}`
  const simulatedTimestamp = `${Math.floor(Date.now() / 1000)}.${String(Math.floor(Math.random() * 1000000000)).padStart(9, '0')}`

  return {
    success: true,
    transactionId: simulatedTxId,
    consensusTimestamp: simulatedTimestamp,
    mode: 'simulation',
    topicId: HEDERA_TOPIC_ID || 'not-configured',
    isProductionEvidence: false, // CRITICAL: simulation is NOT production evidence
  }
}

// Create outbox event for async processing with retry
export async function createOutboxEvent(
  eventType: string,
  payload: any,
): Promise<string> {
  const event = await db.outboxEvent.create({
    data: {
      eventType,
      payload: JSON.stringify(payload),
      status: 'pending',
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: new Date(),
    },
  })

  // Try to process immediately
  processOutboxEvent(event.id).catch(() => {})

  return event.id
}

// Process outbox event with exponential backoff retry
export async function processOutboxEvent(eventId: string): Promise<void> {
  const event = await db.outboxEvent.findUnique({ where: { id: eventId } })
  if (!event) return

  // Skip if already confirmed or max retries exceeded
  if (event.status === 'confirmed' || (event.retryCount >= event.maxRetries && event.status === 'failed')) {
    return
  }

  // Mark as processing
  await db.outboxEvent.update({
    where: { id: eventId },
    data: { status: 'processing' },
  })

  try {
    const payload = JSON.parse(event.payload)

    const result = await submitAttestation(
      payload.batchHash,
      payload.merkleRoot,
      payload.payloadSummary || {},
    )

    if (result.success) {
      await db.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: 'confirmed',
          hederaTransactionId: result.transactionId,
          consensusTimestamp: result.consensusTimestamp,
          processedAt: new Date(),
        },
      })

      // Update the attestation batch if linked
      if (payload.attestationBatchId) {
        await db.attestationBatch.update({
          where: { id: payload.attestationBatchId },
          data: {
            status: 'confirmed',
            hederaTransactionId: result.transactionId,
            consensusTimestamp: result.consensusTimestamp,
            confirmedAt: new Date(),
          },
        })
      }
    } else {
      throw new Error(result.error || 'Submission failed')
    }
  } catch (error: any) {
    const newRetryCount = event.retryCount + 1
    const isMaxRetries = newRetryCount >= event.maxRetries

    // Exponential backoff: 1min, 5min, 15min, 60min, 4hr
    const backoffMinutes = [1, 5, 15, 60, 240][Math.min(newRetryCount - 1, 4)]
    const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000)

    await db.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: isMaxRetries ? 'failed' : 'pending',
        retryCount: newRetryCount,
        lastError: error.message,
        nextRetryAt: nextRetry,
      },
    })
  }
}

// Reconciliation: compare expected vs actual attestations
export async function runReconciliation(
  projectId?: string,
  batchId?: string,
): Promise<{
  runId: string
  status: string
  expectedCount: number
  actualCount: number
  mismatchCount: number
}> {
  const run = await db.reconciliationRun.create({
    data: {
      projectId,
      batchId,
      status: 'running',
    },
  })

  try {
    // Get all attestation batches
    const where: any = {}
    if (projectId) where.projectId = projectId
    if (batchId) where.id = batchId

    const batches = await db.attestationBatch.findMany({ where })

    let expected = 0
    let actual = 0
    let mismatches = 0
    const mismatchDetails: any[] = []

    for (const batch of batches) {
      expected++

      // Check if outbox event exists and is confirmed
      const outboxEvents = await db.outboxEvent.findMany({
        where: {
          payload: { contains: batch.id },
          status: 'confirmed',
        },
      })

      if (outboxEvents.length > 0) {
        actual++

        // Verify transaction ID matches
        const outbox = outboxEvents[0]
        if (batch.hederaTransactionId !== outbox.hederaTransactionId) {
          mismatches++
          mismatchDetails.push({
            batchId: batch.id,
            expected: batch.hederaTransactionId,
            actual: outbox.hederaTransactionId,
          })
        }
      } else {
        // Check if batch is confirmed but no outbox event
        if (batch.status === 'confirmed') {
          actual++
        } else {
          mismatches++
          mismatchDetails.push({
            batchId: batch.id,
            issue: 'Batch not confirmed and no outbox event',
          })
        }
      }
    }

    await db.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: mismatches > 0 ? 'mismatch' : 'completed',
        expectedCount: expected,
        actualCount: actual,
        mismatchCount: mismatches,
        details: JSON.stringify(mismatchDetails),
        completedAt: new Date(),
      },
    })

    return {
      runId: run.id,
      status: mismatches > 0 ? 'mismatch' : 'completed',
      expectedCount: expected,
      actualCount: actual,
      mismatchCount: mismatches,
    }
  } catch (error: any) {
    await db.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        details: JSON.stringify({ error: error.message }),
        completedAt: new Date(),
      },
    })

    return {
      runId: run.id,
      status: 'failed',
      expectedCount: 0,
      actualCount: 0,
      mismatchCount: 0,
    }
  }
}

// Process pending outbox events (should be called by a cron job)
export async function processPendingOutboxEvents(): Promise<{
  processed: number
  confirmed: number
  failed: number
}> {
  const pendingEvents = await db.outboxEvent.findMany({
    where: {
      status: 'pending',
      nextRetryAt: { lte: new Date() },
    },
    take: 50, // process in batches
  })

  let confirmed = 0
  let failed = 0

  for (const event of pendingEvents) {
    await processOutboxEvent(event.id)
    const updated = await db.outboxEvent.findUnique({
      where: { id: event.id },
      select: { status: true },
    })
    if (updated?.status === 'confirmed') confirmed++
    if (updated?.status === 'failed') failed++
  }

  return {
    processed: pendingEvents.length,
    confirmed,
    failed,
  }
}
