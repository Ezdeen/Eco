/**
 * generate-n8n-webhook-secret.mjs
 * --------------------------------------------------------------------
 * يولّد N8N_WEBHOOK_SECRET عشوائيًا (48 بايت = 64 حرف hex)
 * ويضيفه/يحدّثه في ملف .env تلقائيًا.
 *
 * الاستخدام:
 *   node scripts/generate-n8n-webhook-secret.mjs
 *
 * السكربت سـ:
 *   1. يولّد سر 64 حرف hex آمن
 *   2. يقرأ .env الحالي
 *   3. يضيف/يستبدل N8N_WEBHOOK_SECRET
 *   4. يطبع السر مرة واحدة على الشاشة (لنسخه في n8n لاحقًا)
 *   5. يحذّر إن كان JWT_SECRET غائبًا أو إن كان التطبيق في وضع production
 * --------------------------------------------------------------------
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ENV_PATH = path.resolve(__dirname, '..', '.env')

const SECRET_LENGTH_BYTES = 48 // 64 hex chars — طول كافٍ لمقاومة brute-force

function generateSecret() {
  return crypto.randomBytes(SECRET_LENGTH_BYTES).toString('hex')
}

function parseEnv(content) {
  const lines = content.split('\n')
  const entries = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      entries.push({ raw: line, key: null, value: null })
      continue
    }
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) {
      entries.push({ raw: line, key: null, value: null })
      continue
    }
    let key = trimmed.slice(0, eqIdx).trim()
    // أزل علامات الاقتباس إن وُجدت
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    entries.push({ raw: line, key, value })
  }
  return entries
}

function serializeEnv(entries) {
  return entries
    .map((e) => {
      if (e.key === null) return e.raw
      // استخدم علامات اقتباس فقط إن كان فيه مسافات أو رموز خاصة
      const safe = /^[A-Za-z0-9_\-:/]+$/.test(e.value) ? e.value : `"${e.value}"`
      return `${e.key}=${safe}`
    })
    .join('\n')
}

function backupEnv(content) {
  const backupPath = `${ENV_PATH}.backup-${Date.now()}`
  fs.writeFileSync(backupPath, content, 'utf-8')
  return backupPath
}
