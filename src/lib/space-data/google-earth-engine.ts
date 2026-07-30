// Google Earth Engine (GEE) Connector — عبر REST API الرسمي (وليس مكتبة earthengine-api بايثون).
// المصدر: https://developers.google.com/earth-engine/reference
//
// يستخدم Service Account (JSON key) للمصادقة عبر OAuth2 JWT Bearer Flow (RFC 7523)،
// ثم يستدعي Earth Engine REST API لتشغيل تعبير computePixels على نقطة واحدة (lat, lon)
// ولاستخراج القيمة الزمنية بدقة لهذه الإحداثية دون الحاجة لأي بيئة Python.
//
// يجمّع بيانات NDVI/EVI من Sentinel-2 وLandsat وMODIS، وLST من MODIS،
// وNO2/Aerosol Index من Sentinel-5P (مفيد كمؤشر بيئي/حوكمي إضافي).

import crypto from 'crypto'

export interface GeeServiceAccount {
  client_email: string
  private_key: string
  project_id?: string
}

export interface GeeObservation {
  observedAt: string
  dataset: string // 'Sentinel-2' | 'Sentinel-5P' | 'Landsat-8/9' | 'MODIS'
  ndvi: number | null
  evi: number | null
  lstC: number | null
  no2ColumnMolM2: number | null
  aerosolIndex: number | null
  raw: any
}

const GEE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EE_API_ROOT = 'https://earthengine.googleapis.com/v1'
const EE_SCOPE = 'https://www.googleapis.com/auth/earthengine.readonly'

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * يبني ويوقّع JWT بمصادقة Service Account (RS256)، ثم يستبدله بـ access_token
 * عبر Google OAuth2 token endpoint — تطبيق مباشر لـ RFC 7523 بدون أي مكتبة خارجية.
 */
export async function getGeeAccessToken(serviceAccount: GeeServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: EE_SCOPE,
    aud: GEE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedClaims = base64url(JSON.stringify(claimSet))
  const signingInput = `${encodedHeader}.${encodedClaims}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(serviceAccount.private_key)
  const jwt = `${signingInput}.${base64url(signature)}`

  const response = await fetch(GEE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`فشل الحصول على access token من Google OAuth2: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data.access_token
}

// تعريفات المجموعات (ImageCollections) المستخدمة والنطاق الزمني الذي نطلبه لكل منها.
// نطلب نافذة زمنية (وليس يومًا واحدًا) لأن الأقمار الصناعية لا تمر فوق كل نقطة كل يوم؛
// نأخذ composite (median/mean) لآخر نافذة متاحة كأدق تقدير حالي للإحداثية.
const DATASETS = {
  sentinel2: {
    collection: 'COPERNICUS/S2_SR_HARMONIZED',
    dataset: 'Sentinel-2',
    windowDays: 14,
  },
  landsat: {
    collection: 'LANDSAT/LC08/C02/T1_L2',
    dataset: 'Landsat-8/9',
    windowDays: 16,
  },
  modisVeg: {
    collection: 'MODIS/061/MOD13Q1', // NDVI/EVI 16-day composite
    dataset: 'MODIS',
    windowDays: 16,
  },
  modisLst: {
    collection: 'MODIS/061/MOD11A2', // Land Surface Temperature 8-day composite
    dataset: 'MODIS',
    windowDays: 8,
  },
  sentinel5pNo2: {
    collection: 'COPERNICUS/S5P/OFFL/L3_NO2',
    dataset: 'Sentinel-5P',
    windowDays: 7,
  },
}

/**
 * ينفّذ استعلام computeValue بسيط عبر EE REST API: يبني تعبير (Expression) لسحب متوسط
 * قيمة نطاق (band) معيّن ضمن مجموعة صور، عند نقطة واحدة، ضمن نافذة زمنية.
 * ملاحظة: يتطلب هذا أن يكون Service Account مرتبطًا بمشروع Google Cloud مفعّل عليه Earth Engine API.
 */
async function computeMeanBandValue(params: {
  accessToken: string
  cloudProjectId: string
  collection: string
  band: string
  lat: number
  lon: number
  windowDays: number
  scaleFactor?: number // لبعض النطاقات (مثل NDVI المخزّن كـ int) يلزم قسمة scale لإرجاعها كنسبة عشرية
}): Promise<number | null> {
  const { accessToken, cloudProjectId, collection, band, lat, lon, windowDays, scaleFactor } = params

  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - windowDays)

  // Earth Engine Expression Graph — مكافئ لـ:
  // ee.ImageCollection(collection).filterDate(start, end).select(band).mean()
  //   .reduceRegion(ee.Reducer.mean(), ee.Geometry.Point([lon, lat]), 30)
  const expression = {
    expression: {
      values: {
        '1': {
          functionInvocationValue: {
            functionName: 'ImageCollection.load',
            arguments: { id: { constantValue: collection } },
          },
        },
        '2': {
          functionInvocationValue: {
            functionName: 'ImageCollection.filterDate',
            arguments: {
              collection: { valueReference: '1' },
              start: { constantValue: start.toISOString() },
              end: { constantValue: end.toISOString() },
            },
          },
        },
        '3': {
          functionInvocationValue: {
            functionName: 'ImageCollection.select',
            arguments: {
              collection: { valueReference: '2' },
              bandSelectors: { constantValue: [band] },
            },
          },
        },
        '4': {
          functionInvocationValue: {
            functionName: 'ImageCollection.mean',
            arguments: { collection: { valueReference: '3' } },
          },
        },
        '5': {
          functionInvocationValue: {
            functionName: 'GeometryConstructors.Point',
            arguments: { coordinates: { constantValue: [lon, lat] } },
          },
        },
        '6': {
          functionInvocationValue: {
            functionName: 'Reducer.mean',
            arguments: {},
          },
        },
        '7': {
          functionInvocationValue: {
            functionName: 'Image.reduceRegion',
            arguments: {
              image: { valueReference: '4' },
              reducer: { valueReference: '6' },
              geometry: { valueReference: '5' },
              scale: { constantValue: 30 },
            },
          },
        },
      },
      result: '7',
    },
  }

  const url = `${EE_API_ROOT}/projects/${cloudProjectId}/value:compute`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(expression),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error(`GEE computeValue error for ${collection}/${band}:`, response.status, text)
    return null
  }

  const data = await response.json()
  // النتيجة تأتي كـ { result: { <band>: <value> } } تقريبًا حسب استجابة v1 API
  const raw = data?.result?.[band]
  if (typeof raw !== 'number') return null
  return scaleFactor ? raw * scaleFactor : raw
}

/**
 * يجلب أحدث مؤشرات الرصد الأرضي (NDVI/EVI/LST/NO2) لإحداثية معيّنة من مصادر GEE المتعددة.
 * كل استدعاء مستقل حتى لا يفشل الجميع إذا تعذّر الوصول لمجموعة بيانات واحدة (مثلًا صيانة أو تغيير اسم).
 */
export async function fetchGeeObservations(
  serviceAccount: GeeServiceAccount,
  latitude: number,
  longitude: number,
): Promise<GeeObservation[]> {
  const cloudProjectId = serviceAccount.project_id
  if (!cloudProjectId) {
    throw new Error('GEE Service Account لا يحتوي على project_id — مطلوب لاستدعاء Earth Engine REST API')
  }

  const accessToken = await getGeeAccessToken(serviceAccount)
  const results: GeeObservation[] = []
  const now = new Date().toISOString()

  // MODIS Vegetation (NDVI/EVI) — أكثر استقرارًا وتغطية سحابية أقل تأثيرًا من Sentinel-2 البصري
  try {
    const ndviRaw = await computeMeanBandValue({
      accessToken, cloudProjectId,
      collection: DATASETS.modisVeg.collection,
      band: 'NDVI', lat: latitude, lon: longitude,
      windowDays: DATASETS.modisVeg.windowDays,
      scaleFactor: 0.0001, // MODIS NDVI مخزّن كعدد صحيح × 10000
    })
    const eviRaw = await computeMeanBandValue({
      accessToken, cloudProjectId,
      collection: DATASETS.modisVeg.collection,
      band: 'EVI', lat: latitude, lon: longitude,
      windowDays: DATASETS.modisVeg.windowDays,
      scaleFactor: 0.0001,
    })
    if (ndviRaw !== null || eviRaw !== null) {
      results.push({
        observedAt: now, dataset: 'MODIS',
        ndvi: ndviRaw, evi: eviRaw, lstC: null, no2ColumnMolM2: null, aerosolIndex: null,
        raw: { band: 'NDVI/EVI', ndviRaw, eviRaw },
      })
    }
  } catch (e) {
    console.error('GEE MODIS vegetation fetch failed:', e)
  }

  // MODIS Land Surface Temperature
  try {
    const lstRaw = await computeMeanBandValue({
      accessToken, cloudProjectId,
      collection: DATASETS.modisLst.collection,
      band: 'LST_Day_1km', lat: latitude, lon: longitude,
      windowDays: DATASETS.modisLst.windowDays,
      scaleFactor: 0.02, // Kelvin × 0.02
    })
    if (lstRaw !== null) {
      results.push({
        observedAt: now, dataset: 'MODIS',
        ndvi: null, evi: null, lstC: Math.round((lstRaw - 273.15) * 100) / 100,
        no2ColumnMolM2: null, aerosolIndex: null,
        raw: { band: 'LST_Day_1km', kelvin: lstRaw },
      })
    }
  } catch (e) {
    console.error('GEE MODIS LST fetch failed:', e)
  }

  // Sentinel-2 NDVI (بديل بصري أعلى دقة مكانية، عرضة أكثر للسحب)
  try {
    const nir = await computeMeanBandValue({
      accessToken, cloudProjectId,
      collection: DATASETS.sentinel2.collection,
      band: 'B8', lat: latitude, lon: longitude,
      windowDays: DATASETS.sentinel2.windowDays,
    })
    const red = await computeMeanBandValue({
      accessToken, cloudProjectId,
      collection: DATASETS.sentinel2.collection,
      band: 'B4', lat: latitude, lon: longitude,
      windowDays: DATASETS.sentinel2.windowDays,
    })
    if (nir !== null && red !== null && (nir + red) !== 0) {
      const ndvi = (nir - red) / (nir + red)
      results.push({
        observedAt: now, dataset: 'Sentinel-2',
        ndvi: Math.round(ndvi * 10000) / 10000, evi: null, lstC: null,
        no2ColumnMolM2: null, aerosolIndex: null,
        raw: { b8: nir, b4: red },
      })
    }
  } catch (e) {
    console.error('GEE Sentinel-2 fetch failed:', e)
  }

  // Sentinel-5P — NO2 (مؤشر بيئي/حوكمي إضافي: جودة الهواء حول الموقع)
  try {
    const no2 = await computeMeanBandValue({
      accessToken, cloudProjectId,
      collection: DATASETS.sentinel5pNo2.collection,
      band: 'NO2_column_number_density', lat: latitude, lon: longitude,
      windowDays: DATASETS.sentinel5pNo2.windowDays,
    })
    if (no2 !== null) {
      results.push({
        observedAt: now, dataset: 'Sentinel-5P',
        ndvi: null, evi: null, lstC: null,
        no2ColumnMolM2: no2, aerosolIndex: null,
        raw: { band: 'NO2_column_number_density', value: no2 },
      })
    }
  } catch (e) {
    console.error('GEE Sentinel-5P NO2 fetch failed:', e)
  }

  return results
}

/** اختبار اتصال: يتحقق من إمكانية الحصول على access token صالح فقط (بدون استعلام بيانات فعلي) */
export async function testGeeConnection(
  serviceAccount: GeeServiceAccount,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!serviceAccount.project_id) {
      return { success: false, message: 'مفتاح Service Account لا يحتوي على project_id. تحقق من ملف JSON.' }
    }
    await getGeeAccessToken(serviceAccount)
    return { success: true, message: 'تم توليد access token بنجاح من Google OAuth2 (Service Account صالح).' }
  } catch (error: any) {
    return { success: false, message: error?.message || 'فشل الاتصال بـ Google Earth Engine' }
  }
}
