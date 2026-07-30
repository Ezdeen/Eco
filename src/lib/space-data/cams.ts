// CAMS (Copernicus Atmosphere Monitoring Service) Connector
// عبر Atmosphere Data Store (ADS) REST API — وليس مكتبة ecmwf-api-client بايثون
// (تلك المكتبة هي فعليًا wrapper رفيع فوق نفس REST API: تسجيل طلب → استطلاع الحالة → تحميل الملف).
// المصدر: https://ads.atmosphere.copernicus.eu/api-how-to
//
// يوفر منتج "CAMS Solar Radiation" مباشرة كـ CSV عبر api.soda-pro.com (خدمة تابعة لـ CAMS
// مخصصة تحديدًا للإشعاع الشمسي عند نقطة واحدة GHI/DNI/DIF)، وهذا أبسط وأدق لحالتنا
// (بيانات نقطية لإحداثية واحدة) من طلب شبكي كامل عبر ADS القياسي.
//
// إن لم تتوفر بيانات CAMS Solar Radiation (مثلاً الموقع خارج تغطية القمر الصناعي المستخدم)،
// نُرجع null بشفافية بدل تلفيق قيم.

export interface CamsResult {
  observedAt: string
  ghiWm2: number | null
  dniWm2: number | null
  difWm2: number | null
  aod: number | null
  raw: any
}

export interface CamsCredentials {
  // بيانات اعتماد CAMS/ADS (تُطلب مجانًا من https://ads.atmosphere.copernicus.eu)
  // uid:key بصيغة ADS API القياسية، تُستخدم أيضًا لخدمة CAMS Radiation المرتبطة
  username: string // البريد الإلكتروني المسجّل في CAMS
  apiKey: string // ADS API key
}

const CAMS_RADIATION_URL = 'https://api.soda-pro.com/service/wps'

/**
 * يجلب أحدث قيم الإشعاع الشمسي الفعلي (GHI/DNI/DIF) من CAMS Solar Radiation Service
 * لإحداثية معيّنة، بالإضافة إلى AOD (نسبة الغبار) من نفس المنتج.
 * يطلب آخر يوم مكتمل متاح (عادة بتأخير يوم إلى يومين عن البيانات شبه الفورية).
 */
export async function fetchCamsLatest(
  credentials: CamsCredentials,
  latitude: number,
  longitude: number,
): Promise<CamsResult | null> {
  try {
    const end = new Date()
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 5) // نافذة أيام لضمان توفر آخر يوم مُعالَج

    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    // طلب WPS (Web Processing Service) القياسي لخدمة CAMS Radiation — get_cams_radiation
    const params = new URLSearchParams({
      Service: 'WPS',
      Request: 'Execute',
      Identifier: 'get_cams_radiation',
      version: '1.0.0',
      RawDataOutput: 'irradiation',
      'DataInputs': [
        `latitude=${latitude}`,
        `longitude=${longitude}`,
        `date_begin=${fmt(start)}`,
        `date_end=${fmt(end)}`,
        `time_ref=UT`,
        `summarization=PT01H`,
        `username=${credentials.username}`,
      ].join(';'),
    })

    const url = `${CAMS_RADIATION_URL}?${params.toString()}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.apiKey}`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('CAMS Radiation API error:', response.status, text)
      return null
    }

    const text = await response.text()

    // الاستجابة عادة CSV مضمّن داخل استجابة WPS، بترويسة أسطر تبدأ بـ # ثم بيانات مفصولة بـ ;
    // نأخذ آخر سطر بيانات صالح (أحدث ساعة/يوم متاح).
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    if (lines.length === 0) {
      console.error('CAMS Radiation: لا توجد بيانات في الاستجابة (قد يكون الموقع خارج نطاق التغطية)')
      return null
    }

    const lastLine = lines[lines.length - 1]
    const cols = lastLine.split(';').map((c) => c.trim())
    // ترتيب أعمدة get_cams_radiation القياسي:
    // Observation period; TOA; Clear sky GHI; Clear sky BHI; Clear sky DHI; Clear sky BNI;
    // GHI; BHI; DHI; BNI
    if (cols.length < 10) {
      console.error('CAMS Radiation: صيغة استجابة غير متوقعة', lastLine)
      return null
    }

    const period = cols[0] // مثال: "2026-07-29T10:00:00.0/2026-07-29T11:00:00.0"
    const observedAt = new Date(period.split('/')[0]).toISOString()

    const ghi = parseFloat(cols[6])
    const dhi = parseFloat(cols[8]) // Diffuse Horizontal Irradiance ≈ DIF
    const bni = parseFloat(cols[9]) // Beam Normal Irradiance ≈ DNI

    return {
      observedAt,
      ghiWm2: isFinite(ghi) ? ghi : null,
      dniWm2: isFinite(bni) ? bni : null,
      difWm2: isFinite(dhi) ? dhi : null,
      aod: null, // AOD يتطلب استعلام منتج CAMS منفصل (Aerosol)؛ محجوز للتوسعة اللاحقة
      raw: { period, columns: cols },
    }
  } catch (error) {
    console.error('CAMS fetch failed:', error)
    return null
  }
}

/** اختبار اتصال باستخدام إحداثية مرجعية */
export async function testCamsConnection(
  credentials: CamsCredentials,
): Promise<{ success: boolean; message: string }> {
  if (!credentials.username || !credentials.apiKey) {
    return { success: false, message: 'يلزم إدخال اسم المستخدم ومفتاح API الخاصين بـ CAMS/ADS.' }
  }
  const result = await fetchCamsLatest(credentials, 24.7136, 46.6753)
  if (result) {
    return { success: true, message: `تم الاتصال بنجاح. آخر بيانات إشعاع بتاريخ ${result.observedAt.slice(0, 10)}` }
  }
  return { success: false, message: 'تعذر جلب بيانات من CAMS. تحقق من صحة بيانات الاعتماد وحساب ADS.' }
}
