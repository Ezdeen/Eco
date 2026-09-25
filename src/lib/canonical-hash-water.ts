// Canonical hashing for smart water meter readings.
//
// هذا الملف نسخة مطابقة تمامًا لآلية src/lib/canonical-hash.ts (المستخدمة للإنفرتر) لكن مطبّقة
// على قراءات عداد المياه الذكي، حتى تُعامَل بيانات الري الذكي بنفس مستوى الثقة والتحقق المستخدم
// لبيانات الطاقة الشمسية (dMRV consistency).
//
// CRITICAL: هذا التنسيق النصي والخوارزمية يجب أن يُنسَخا بالضبط داخل خطوة (Function node) بسير عمل
// n8n الخاص بعداد المياه، لأن n8n يحسب Hash_08 بشكل مستقل ويُثبّته على Hedera قبل أن تصل القراءة
// إلى المنصة أصلاً. أي اختلاف بسيط (رقم عشري زائد، تنسيق تاريخ مختلف، ترتيب حقول مختلف) يجعل كل
// قراءة تظهر hashMatchStatus = 'mismatch' حتى لو لم يحدث أي تلاعب فعلي.
//
// راجع scripts/n8n-water-meter-hash-function.js للكود المكافئ الجاهز للصق داخل n8n.
import crypto from 'crypto'

export interface WaterMeterReadingPayload {
  serialNumber: string
  intervalVolumeM3: number // الحجم المُستهلَك خلال هذه الفترة (م³) — مكافئ لـ productionNow بالإنفرتر
  cumulativeM3: number // القراءة التراكمية لعداد المياه منذ التركيب (م³) — مكافئ لـ productionTotal بالإنفرتر
  timestamp: string // ISO 8601، يجب أن يكون مُطبَّعًا مسبقًا إلى UTC مع المللي ثانية، مثال: 2026-07-18T08:00:00.000Z
}

// تطبيع الرقم إلى نص ثابت لا لبس فيه: بدون Scientific Notation، بدون أصفار زائدة، يطابق سلوك
// JS الافتراضي لتحويل Number->String (وهو أيضًا ما ينتجه Function node بـ n8n لأنه يعمل على Node.js).
function normalizeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot hash non-finite number: ${n}`)
  }
  return String(n)
}

// النص القانوني بالضبط. الترتيب والفاصل جزء من "العقد" (contract) — لا تُغيَّر بدون تحديث سير عمل
// n8n بالتزامن، وبدون خطة ترحيل للقراءات المُوثَّقة مسبقًا بالتنسيق القديم.
export function buildCanonicalWaterString(payload: WaterMeterReadingPayload): string {
  const { serialNumber, intervalVolumeM3, cumulativeM3, timestamp } = payload
  return [
    serialNumber.trim(),
    normalizeNumber(intervalVolumeM3),
    normalizeNumber(cumulativeM3),
    timestamp.trim(),
  ].join('|')
}

// بصمة SHA-256 (حروف صغيرة)، مطابقة لسلوك وحدة crypto الافتراضية في Node — Function node بـ n8n
// يعمل على Node.js أيضًا، لذا `require('crypto')` هناك ينتج نفس المخرجات تمامًا.
export function computeCanonicalWaterHash(payload: WaterMeterReadingPayload): string {
  const canonical = buildCanonicalWaterString(payload)
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')
}
