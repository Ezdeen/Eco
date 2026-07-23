/**
 * test-n8n-webhook.mjs
 * --------------------------------------------------------------------
 * يختبر /api/webhooks/n8n محليًا بالـ HMAC الصحيح قبل ربط n8n.
 *
 * الاستخدام:
 *   node scripts/test-n8n-webhook.mjs [BASE_URL] [PROJECT_ID]
 *
 * مثال:
 *   node scripts/test-n8n-webhook.mjs http://localhost:3000
 *   node scripts/test-n8n-webhook.mjs https://eco.example.com clxxxxxx123
 *
 * السكربت يقرأ N8N_WEBHOOK_SECRET من .env تلقائيًا.
 * --------------------------------------------------------------------
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ENV_PATH = path.resolve(__dirname, '..', '.env')

function loadEnvSecret() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`❌ ملف .env غير موجود في: ${ENV_PATH}`)
    console.error('   شغّل generate-n8n-webhook-secret.mjs أولًا.')
    process.exit(1)
  }
  const content = fs.readFileSync(ENV_PATH, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed) continue
    const match = trimmed.match(/^N8N_WEBHOOK_SECRET\s*=\s*"?([^"\n]+)"?$/)
    if (match) return match[1]
  }
  console.error('❌ N8N_WEBHOOK_SECRET غير موجود في .env')
  console.error('   شغّل: node scripts/generate-n8n-webhook-secret.mjs')
  process.exit(1)
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

async function main() {
  const baseUrl = process.argv[2] || 'http://localhost:3000'
  const projectId = process.argv[3] || 'TEST-PROJECT-ID' // استبدله بمعرّف مشروع حقيقي لاختبار شامل
  const secret = loadEnvSecret()

  console.log(`\n🧪 اختبار n8n webhook`)
  console.log(`   Target:    ${baseUrl}/api/webhooks/n8n`)
  console.log(`   ProjectID: ${projectId}`)
  console.log(`   Secret:    ${secret.slice(0, 8)}...${secret.slice(-4)}\n`)

  // 1. ابنِ payload مطابقًا تمامًا لما يتوقعه الخادم
  const now = Date.now()
  const eventId = `test-${now}-${crypto.randomBytes(4).toString('hex')}`
  const measuredAt = new Date(now).toISOString()

  const payload = {
    eventType: 'reading_ingest',
    projectId,
    readings: [
      {
        deviceId: 'TEST-DEVICE-001',
        siteId: undefined,
        assetId: undefined,
        metricType: 'energy_export_kwh',
        measuredAt,
        intervalStart: measuredAt,
        value: 12.5,
        unit: 'kWh',
      },
    ],
  }

  const rawPayload = JSON.stringify(payload)
  const response = await fetch(`${baseUrl}/api/webhooks/n8n`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-n8n-signature': signPayload(rawPayload, secret),
      'x-n8n-timestamp': String(now),
      'x-n8n-event-id': eventId,
      'x-source-id': 'TEST-DEVICE-001',
    },
    body: rawPayload,
  })

  const responseBody = await response.text()
  console.log(`Status: ${response.status}`)
  console.log(responseBody)

  if (!response.ok) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
