// Canonical hashing for inverter readings.
//
// CRITICAL: This exact string format and algorithm MUST be replicated identically inside
// the n8n workflow (Function node), because n8n computes Hash_08 independently and submits
// it to Hedera BEFORE the platform ever sees the reading. If the platform's canonicalization
// differs from n8n's by even one character (extra decimal, different date format, different
// field order), every single reading will show hashMatchStatus = 'mismatch' even when nothing
// was tampered with.
//
// See /mnt/user-data/outputs/n8n-hash-function-node.js for the equivalent n8n code.
import crypto from 'crypto'

export interface InverterReadingPayload {
  serialNumber: string
  productionNow: number
  productionTotal: number
  timestamp: string // ISO 8601, must already be normalized to UTC with milliseconds, e.g. 2026-07-18T08:00:00.000Z
}

// Normalize a number to a fixed, unambiguous string form: no scientific notation,
// no trailing zeros beyond what's needed, always at least one digit after the decimal point
// removed entirely if the value is a whole number (matches JS's default Number->String behavior,
// which is also what n8n's Function node (plain JS/Node) will naturally produce).
function normalizeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot hash non-finite number: ${n}`)
  }
  return String(n)
}

// The exact canonical string. ORDER AND SEPARATOR ARE PART OF THE CONTRACT — do not change
// without updating the n8n workflow function in lockstep, and without a migration plan for
// readings already attested under the old format.
export function buildCanonicalString(payload: InverterReadingPayload): string {
  const { serialNumber, productionNow, productionTotal, timestamp } = payload
  return [
    serialNumber.trim(),
    normalizeNumber(productionNow),
    normalizeNumber(productionTotal),
    timestamp.trim(),
  ].join('|')
}

// SHA-256 hex digest (lowercase), matching Node's crypto module default — n8n's Function
// node runs on Node.js under the hood, so `require('crypto')` there produces identical output.
export function computeCanonicalHash(payload: InverterReadingPayload): string {
  const canonical = buildCanonicalString(payload)
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')
}
