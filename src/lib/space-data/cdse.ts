// Copernicus Data Space Ecosystem (CDSE) Connector — عبر Sentinel Hub Statistical API
// المصدر الرسمي: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html
//
// بديل عملي لـ Google Earth Engine: يوفّر نفس المؤشرات (NDVI, EVI, LST-تقريبي, NO2) من
// بيانات Sentinel (1/2/3/5P) مباشرة، لكن بمصادقة أبسط بكثير — OAuth2 client_credentials
// قياسي (Client ID + Client Secret فقط)، بدون تسجيل مشروع Cloud منفصل أو أدوار IAM معقّدة
// كما يتطلب GEE. هذا يجعله مناسبًا جدًا لمنصة تُعنى بالحوكمة والشفافية: خطوات إعداد أقل
// تعقيدًا يعني تدقيقًا أسهل وقابلية أكبر للتكرار من قِبل فرق أخرى.
//
// يستخدم "Statistical API" (وليس تحميل صور خام): نرسل مربعًا صغيرًا جدًا حول الإحداثية
// (نطاق ~100م) ونطلب متوسط (mean) قيمة الفهرس المحسوب عبر evalscript، فنحصل مباشرة على
// رقم واحد يمثّل الإحداثية دون معالجة صور بأنفسنا.

import crypto from 'crypto'

export interface CdseCredentials {
  clientId: string
  clientSecret: string
}

export interface CdseObservation {
  observedAt: string
  dataset: string // 'Sentinel-2' | 'Sentinel-5P' (Sentinel-3 LST معطَّل مؤقتًا، راجع الملاحظة أدناه)
  ndvi: number | null
  evi: number | null
  lstC: number | null
  no2ColumnMolM2: number | null
  aerosolIndex: number | null
  raw: any
}

const CDSE_TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const CDSE_STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/statistics/v1'

/** يحصل على access token عبر OAuth2 client_credentials grant (قياسي تمامًا، بدون JWT مخصص) */
export async function getCdseAccessToken(credentials: CdseCredentials): Promise<string> {
  const response = await fetch(CDSE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`فشل الحصول على access token من CDSE: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data.access_token
}

// نطاق صغير جدًا (~100م × 100م) حول الإحداثية، بنظام الإحداثيات الجغرافي القياسي (EPSG:4326)
function buildBoundingBox(lat: number, lon: number) {
  const deltaDeg = 0.0009 // ≈ 100 متر تقريبًا عند خط الاستواء
  return [lon - deltaDeg, lat - deltaDeg, lon + deltaDeg, lat + deltaDeg]
}

async function runStatisticalQuery(params: {
  accessToken: string
  bbox: number[]
  collection: string
  evalscript: string
  outputId: string
  band: string
  fromDate: string
  toDate: string
}): Promise<number | null> {
  const { accessToken, bbox, collection, evalscript, outputId, band, fromDate, toDate } = params

  const body = {
    input: {
      bounds: {
        bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
      },
      data: [{ type: collection, dataFilter: { mosaickingOrder: 'mostRecent' } }],
    },
    aggregation: {
      timeRange: { from: fromDate, to: toDate },
      aggregationInterval: { of: `P${Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000))}D` },
      evalscript,
      resx: 10,
      resy: 10,
    },
  }

  const response = await fetch(CDSE_STATISTICS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error(`CDSE Statistical API error for ${collection}/${band}:`, response.status, text)
    return null
  }

  const data = await response.json()
  // نأخذ آخر فاصل زمني (الأحدث) الذي يحتوي بيانات فعلية (وليس بالضرورة أول عنصر)
  const intervals = data?.data
  if (!Array.isArray(intervals) || intervals.length === 0) return null

  for (let i = intervals.length - 1; i >= 0; i--) {
    const mean = intervals[i]?.outputs?.[outputId]?.bands?.[band]?.stats?.mean
    if (typeof mean === 'number' && isFinite(mean)) return mean
  }
  return null
}

// evalscripts لكل مؤشر — بسيطة ومباشرة، تُرجع قيمة واحدة (index) مع dataMask لاستبعاد
// البكسلات غير الصالحة (سحاب/بلا بيانات) من حساب المتوسط تلقائيًا.
const NDVI_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [{ id: "ndvi", bands: 1 }, { id: "dataMask", bands: 1 }]
  }
}
function evaluatePixel(s) {
  let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-9)
  let cloudMask = (s.SCL == 8 || s.SCL == 9 || s.SCL == 3) ? 0 : 1 // استبعاد السحاب وظلاله
  return { ndvi: [ndvi], dataMask: [s.dataMask * cloudMask] }
}`

const EVI_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B04", "B08", "SCL", "dataMask"] }],
    output: [{ id: "evi", bands: 1 }, { id: "dataMask", bands: 1 }]
  }
}
function evaluatePixel(s) {
  let evi = 2.5 * (s.B08 - s.B04) / (s.B08 + 6.0 * s.B04 - 7.5 * s.B02 + 1 + 1e-9)
  let cloudMask = (s.SCL == 8 || s.SCL == 9 || s.SCL == 3) ? 0 : 1
  return { evi: [evi], dataMask: [s.dataMask * cloudMask] }
}`

// ملاحظة مهمة: تمت إزالة استعلام Land Surface Temperature (LST) من Sentinel-3 SLSTR هنا.
// السبب (مؤكَّد من اختبار فعلي وتوثيق Copernicus الرسمي): مجموعة `sentinel-3-slstr` المتاحة
// في Sentinel Hub Process/Statistical API هي منتج L1B الخام (نطاقات S1-S8 فقط: انعكاسية
// وحرارة إشعاعية خام)، وليست منتج LST الجاهز (Sentinel-3 SLSTR L2 LST). حساب LST من L1B
// يتطلب معادلة تصحيح انبعاثية معقّدة (باستخدام NDVI مساعد)، بينما منتج L2 LST الجاهز غير
// متاح حاليًا كـ collection قياسي في evalscript بنفس السهولة (يحتاج وصولاً مختلفًا عبر
// Catalog/OData أو BYOC). لتفادي فشل صامت متكرر في كل تشغيل، أُبقي فقط على المؤشرات
// المؤكَّدة عمليًا: NDVI/EVI (Sentinel-2) وNO2 (Sentinel-5P). يمكن إضافة LST لاحقًا عند
// توفر وقت لتطبيق معادلة التصحيح الكاملة أو الوصول لمنتج L2 عبر طريقة بديلة.

// NO2 من Sentinel-5P (مؤشر بيئي/حوكمي إضافي لجودة الهواء حول الموقع)
const NO2_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["NO2", "dataMask"] }],
    output: [{ id: "no2", bands: 1 }, { id: "dataMask", bands: 1 }]
  }
}
function evaluatePixel(s) {
  return { no2: [s.NO2], dataMask: [s.dataMask] }
}`

/**
 * يجلب أحدث مؤشرات الرصد الأرضي (NDVI/EVI/LST/NO2) لإحداثية معيّنة من مصادر Sentinel
 * عبر CDSE Statistical API. كل استعلام مستقل حتى لا يفشل الجميع إذا تعذّر الوصول لمجموعة
 * بيانات واحدة (سحاب كامل خلال الفترة، صيانة، إلخ).
 */
export async function fetchCdseObservations(
  credentials: CdseCredentials,
  latitude: number,
  longitude: number,
): Promise<CdseObservation[]> {
  const accessToken = await getCdseAccessToken(credentials)
  const bbox = buildBoundingBox(latitude, longitude)
  const results: CdseObservation[] = []
  const now = new Date().toISOString()

  const end = new Date()
  const start14 = new Date(end)
  start14.setUTCDate(start14.getUTCDate() - 14) // نافذة أسبوعين لـ Sentinel-2 (كل 5 أيام تقريبًا)
  const start7 = new Date(end)
  start7.setUTCDate(start7.getUTCDate() - 7) // نافذة أسبوع لـ Sentinel-3/5P (تغطية يومية تقريبًا)

  // Sentinel-2 L2A — NDVI
  try {
    const ndvi = await runStatisticalQuery({
      accessToken, bbox, collection: 'sentinel-2-l2a',
      evalscript: NDVI_EVALSCRIPT, outputId: 'ndvi', band: 'ndvi',
      fromDate: start14.toISOString(), toDate: end.toISOString(),
    })
    if (ndvi !== null) {
      results.push({
        observedAt: now, dataset: 'Sentinel-2',
        ndvi: Math.round(ndvi * 10000) / 10000, evi: null, lstC: null,
        no2ColumnMolM2: null, aerosolIndex: null, raw: { index: 'NDVI', value: ndvi },
      })
    }
  } catch (e) {
    console.error('CDSE Sentinel-2 NDVI fetch failed:', e)
  }

  // Sentinel-2 L2A — EVI
  try {
    const evi = await runStatisticalQuery({
      accessToken, bbox, collection: 'sentinel-2-l2a',
      evalscript: EVI_EVALSCRIPT, outputId: 'evi', band: 'evi',
      fromDate: start14.toISOString(), toDate: end.toISOString(),
    })
    if (evi !== null) {
      results.push({
        observedAt: now, dataset: 'Sentinel-2',
        ndvi: null, evi: Math.round(evi * 10000) / 10000, lstC: null,
        no2ColumnMolM2: null, aerosolIndex: null, raw: { index: 'EVI', value: evi },
      })
    }
  } catch (e) {
    console.error('CDSE Sentinel-2 EVI fetch failed:', e)
  }

  // ملاحظة: استعلام Sentinel-3 LST أُزيل مؤقتًا (راجع الملاحظة أعلى ملف evalscripts) —
  // منتج L1B لا يحتوي band جاهزًا لـ LST، ومنتج L2 LST الجاهز يحتاج طريقة وصول مختلفة.

  // Sentinel-5P — NO2 (مؤشر بيئي/حوكمي إضافي: جودة الهواء حول الموقع)
  try {
    const no2 = await runStatisticalQuery({
      accessToken, bbox, collection: 'sentinel-5p-l2',
      evalscript: NO2_EVALSCRIPT, outputId: 'no2', band: 'no2',
      fromDate: start7.toISOString(), toDate: end.toISOString(),
    })
    if (no2 !== null) {
      results.push({
        observedAt: now, dataset: 'Sentinel-5P',
        ndvi: null, evi: null, lstC: null,
        no2ColumnMolM2: no2, aerosolIndex: null, raw: { index: 'NO2', value: no2 },
      })
    }
  } catch (e) {
    console.error('CDSE Sentinel-5P NO2 fetch failed:', e)
  }

  return results
}

/** اختبار اتصال: يتحقق من صحة access token فقط (بدون استعلام بيانات فعلي، أسرع وأخف) */
export async function testCdseConnection(
  credentials: CdseCredentials,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!credentials.clientId || !credentials.clientSecret) {
      return { success: false, message: 'يلزم إدخال Client ID وClient Secret الخاصين بحساب CDSE.' }
    }
    await getCdseAccessToken(credentials)
    return { success: true, message: 'تم توليد access token بنجاح من Copernicus Data Space Ecosystem (بيانات الاعتماد صالحة).' }
  } catch (error: any) {
    return { success: false, message: error?.message || 'فشل الاتصال بـ Copernicus Data Space Ecosystem' }
  }
}
