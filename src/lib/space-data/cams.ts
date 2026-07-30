// CAMS (Copernicus Atmosphere Monitoring Service) Connector
// عبر CAMS Radiation Service على soda-pro.com (خدمة رسمية تابعة لـ ECMWF/Copernicus)
// المصدر الرسمي (طريقة الوصول الآلي): https://www.soda-pro.com/help/cams-services/cams-radiation-service/automatic-access
//
// ملاحظة مهمة (مؤكدة من التوثيق الرسمي): هذه الخدمة لا تستخدم "مفتاح API" منفصل —
// المصادقة الوحيدة هي البريد الإلكتروني الذي سجّلته مجانًا على soda-pro.com، ويُمرَّر
// كمعامل "username" ضمن الطلب نفسه (WPS GET request عبر query params، بدون أي
// Authorization header). هذا مطابق تمامًا لما تفعله مكتبة ecmwf-api-client بايثون خلف
// الكواليس (تسجيل حساب مجاني بالبريد ← استدعاء نفس REST endpoint).
//
// نطاق التغطية الجغرافية محدود بمجال رؤية القمر الصناعي Meteosat/Himawari
// (تقريبًا: أوروبا، أفريقيا، الشرق الأوسط، جزء من آسيا وأستراليا، المحيط الأطلسي) —
// يغطي مشاريع الشرق الأوسط والسعودية بلا مشكلة، ولن يُرجع بيانات لموقع خارج هذا النطاق.
//
// يوفر: الإشعاع الشمسي الفعلي (GHI, DNI≈BNI, DIF≈DHI). AOD (نسبة الغبار) غير متاح من
// هذا المنتج بالذات ويتطلب طلب CAMS Aerosol منفصلاً (محجوز للتوسعة اللاحقة).

export interface CamsResult {
  observedAt: string
  ghiWm2: number | null
  dniWm2: number | null
  difWm2: number | null
  aod: number | null
  raw: any
}

export interface CamsCredentials {
  // البريد الإلكتروني المسجَّل مجانًا على https://www.soda-pro.com — هذا هو مفتاح
  // المصادقة الوحيد المطلوب لهذه الخدمة (لا يوجد "API key" منفصل).
  username: string
}

const CAMS_RADIATION_URL = 'https://api.soda-solardata.com/service/wps'

/**
 * يجلب أحدث قيم الإشعاع الشمسي الفعلي (GHI/DNI/DIF) من CAMS Solar Radiation Service
 * لإحداثية معيّنة. يطلب آخر يوم مكتمل متاح (البيانات متاحة عادة حتى يومين قبل اليوم الحالي).
 */
export async function fetchCamsLatest(
  credentials: CamsCredentials,
  latitude: number,
  longitude: number,
): Promise<CamsResult | null> {
  try {
    if (!credentials.username) {
      console.error('CAMS: البريد الإلكتروني المسجَّل في soda-pro.com مفقود')
      return null
    }

    const end = new Date()
    end.setUTCDate(end.getUTCDate() - 2) // البيانات متاحة عادة حتى يومين قبل اليوم الحالي
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 5) // نافذة أيام إضافية لضمان توفر آخر يوم مُعالَج

    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    // طلب WPS (Web Processing Service) القياسي لخدمة CAMS Radiation — get_cams_radiation.
    // بالضبط كما هو موثّق في صفحة "Automatic access": طلب GET بمعاملات query عادية،
    // "username" هو البريد الإلكتروني المسجَّل، ولا يوجد أي Authorization header.
    const dataInputs = [
      `latitude=${latitude}`,
      `longitude=${longitude}`,
      `altitude=-999`, // -999 يعني: احسبها تلقائيًا من نموذج الارتفاعات الرقمي
      `date_begin=${fmt(start)}`,
      `date_end=${fmt(end)}`,
      `time_ref=UT`,
      `summarization=PT01H`,
      `username=${encodeURIComponent(credentials.username)}`,
    ].join(';')

    const params = new URLSearchParams({
      Service: 'WPS',
      Request: 'Execute',
      Identifier: 'get_cams_radiation',
      version: '1.0.0',
      RawDataOutput: 'irradiation',
      DataInputs: dataInputs,
    })

    const url = `${CAMS_RADIATION_URL}?${params.toString()}`

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('CAMS Radiation API error:', response.status, text)
      return null
    }

    const text = await response.text()

    // في حالة الخطأ، الخدمة تُرجع XML (وليس CSV) يحتوي على وصف الخطأ (مثل عدم تسجيل البريد،
    // أو الموقع خارج نطاق التغطية). نتحقق من ذلك أولاً بدل محاولة تحليله كـ CSV.
    if (text.trim().startsWith('<')) {
      console.error('CAMS Radiation: الخدمة أرجعت خطأ (XML) بدل بيانات:', text.slice(0, 500))
      return null
    }

    // الاستجابة الناجحة CSV: أسطر ترويسة تبدأ بـ # ثم بيانات مفصولة بـ ;
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

    const period = cols[0] // مثال: "2026-07-27T10:00:00.0/2026-07-27T11:00:00.0"
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

/** اختبار اتصال باستخدام إحداثية مرجعية داخل نطاق تغطية CAMS (الرياض) */
export async function testCamsConnection(
  credentials: CamsCredentials,
): Promise<{ success: boolean; message: string }> {
  if (!credentials.username) {
    return { success: false, message: 'يلزم إدخال البريد الإلكتروني المسجَّل في soda-pro.com.' }
  }
  const result = await fetchCamsLatest(credentials, 24.7136, 46.6753)
  if (result) {
    return { success: true, message: `تم الاتصال بنجاح. آخر بيانات إشعاع بتاريخ ${result.observedAt.slice(0, 10)}` }
  }
  return {
    success: false,
    message: 'تعذر جلب بيانات من CAMS. تأكد أن البريد الإلكتروني مسجَّل فعليًا على soda-pro.com، وأن الإحداثية ضمن نطاق التغطية (أوروبا/أفريقيا/الشرق الأوسط تقريبًا).',
  }
}
