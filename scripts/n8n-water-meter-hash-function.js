/**
 * كود مرجعي لخطوة (Function node) داخل سير عمل n8n الخاص بعداد المياه الذكي.
 *
 * يُستخدم هذا الكود لحساب Hash_08 من قراءة العداد الواضحة *قبل* إرسالها إلى شبكة Hedera
 * للتوثيق، ثم *قبل* إرسال الحزمة الكاملة (بيانات + هاش + معاملة Hedera) إلى نقطة الاستيعاب:
 *
 *     POST /api/integrations/water-meter
 *
 * CRITICAL: يجب أن يُنتج هذا الكود بالضبط نفس السلسلة النصية والهاش الذي تحسبه المنصة في
 * src/lib/canonical-hash-water.ts (computeCanonicalWaterHash). أي اختلاف — رقم عشري زائد،
 * تنسيق تاريخ مختلف، ترتيب حقول مختلف، مسافات إضافية — يجعل *كل* قراءة تصل تظهر
 * hashMatchStatus = 'mismatch' حتى لو لم يحدث أي تلاعب فعلي بالبيانات.
 *
 * هذا الملف مرجعي فقط (توثيق) — لا يُستورد من الكود، يُنسخ يدويًا داخل n8n.
 */

const crypto = require('crypto')

// نفس دالة normalizeNumber المستخدمة بالضبط في canonical-hash-water.ts
function normalizeNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(`Cannot hash non-finite number: ${n}`)
  }
  return String(n)
}

// نفس تنسيق buildCanonicalWaterString بالضبط: serialNumber|intervalVolumeM3|cumulativeM3|timestamp
function buildCanonicalWaterString({ serialNumber, intervalVolumeM3, cumulativeM3, timestamp }) {
  return [
    String(serialNumber).trim(),
    normalizeNumber(intervalVolumeM3),
    normalizeNumber(cumulativeM3),
    String(timestamp).trim(),
  ].join('|')
}

// === داخل Function node بـ n8n، بعد قراءة العداد من المصدر (Modbus/MQTT/HTTP API) ===
// $json يجب أن يحتوي: serialNumber, intervalVolumeM3, cumulativeM3, timestamp (ISO 8601 UTC)
const payload = {
  serialNumber: $json.serialNumber,
  intervalVolumeM3: $json.intervalVolumeM3,
  cumulativeM3: $json.cumulativeM3,
  // يجب توليد timestamp بصيغة ISO 8601 UTC مع المللي ثانية بالضبط، مثال:
  // new Date().toISOString() -> "2026-07-18T08:00:00.000Z"
  timestamp: $json.timestamp,
}

const canonical = buildCanonicalWaterString(payload)
const hash08 = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')

// الخطوة التالية بسير العمل: إرسال hash08 إلى Hedera Consensus Service للتوثيق (topic.submitMessage)،
// ثم إرسال { ...payload, n8nHash: hash08, hederaTransactionId, hederaConsensusAt } إلى:
//   POST https://<domain>/api/integrations/water-meter
//   Authorization: Bearer esg_xxxxx
return [{ json: { ...payload, n8nHash: hash08 } }]
