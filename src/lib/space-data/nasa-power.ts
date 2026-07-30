// NASA POWER API Connector
// REST API مجاني ومباشر بالكامل (لا يحتاج مفتاح API) — يعيد JSON فور إرسال الإحداثية.
// المصدر: https://power.larc.nasa.gov/docs/services/api/
//
// يوفر: الإشعاع الشمسي التاريخي (GHI)، درجة حرارة الهواء، سرعة الرياح، الرطوبة، الغطاء السحابي.

export interface NasaPowerResult {
  observedAt: string // ISO date (يوم واحد، القيم النهارية)
  ghiWm2: number | null
  temperatureC: number | null
  windSpeedMs: number | null
  humidityPct: number | null
  precipitationMm: number | null
  raw: any
}

const NASA_POWER_BASE_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point'

// معاملات NASA POWER (community RE = Renewable Energy):
// ALLSKY_SFC_SW_DWN: All Sky Surface Shortwave Downward Irradiance (GHI) بوحدة kWh/m^2/day
// T2M: Temperature at 2 Meters (°C)
// WS2M: Wind Speed at 2 Meters (m/s)
// RH2M: Relative Humidity at 2 Meters (%)
// PRECTOTCORR: Precipitation Corrected (mm/day)
const PARAMETERS = ['ALLSKY_SFC_SW_DWN', 'T2M', 'WS2M', 'RH2M', 'PRECTOTCORR']

function formatDateYyyymmdd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * يجلب أحدث القيم اليومية المتاحة لإحداثية (lat, lon) من NASA POWER.
 * NASA POWER بيانات يومية (وليست لحظية)، لذا نطلب نافذة الأيام القليلة الماضية
 * ونأخذ آخر يوم تتوفر له بيانات فعلية (قد يتأخر آخر يوم أو يومين بسبب معالجة الأقمار الصناعية).
 */
export async function fetchNasaPowerLatest(
  latitude: number,
  longitude: number,
): Promise<NasaPowerResult | null> {
  try {
    const end = new Date()
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 7) // نافذة أسبوع لضمان توفر آخر يوم مكتمل

    const params = new URLSearchParams({
      parameters: PARAMETERS.join(','),
      community: 'RE',
      longitude: longitude.toString(),
      latitude: latitude.toString(),
      start: formatDateYyyymmdd(start),
      end: formatDateYyyymmdd(end),
      format: 'JSON',
    })

    const url = `${NASA_POWER_BASE_URL}?${params.toString()}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('NASA POWER API error:', response.status, await safeText(response))
      return null
    }

    const data = await response.json()
    const props = data?.properties?.parameter
    if (!props) return null

    // مفتاح كل يوم بصيغة YYYYMMDD؛ القيمة -999 تعني "غير متاح بعد" في NASA POWER
    const ghiSeries = props.ALLSKY_SFC_SW_DWN || {}
    const dates = Object.keys(ghiSeries).sort() // تصاعديًا

    // نبحث من الأحدث للأقدم عن أول يوم صالح (ليس -999)
    for (let i = dates.length - 1; i >= 0; i--) {
      const dateKey = dates[i]
      const ghi = ghiSeries[dateKey]
      if (ghi === undefined || ghi === -999) continue

      const y = Number(dateKey.slice(0, 4))
      const m = Number(dateKey.slice(4, 6)) - 1
      const d = Number(dateKey.slice(6, 8))
      const observedAt = new Date(Date.UTC(y, m, d)).toISOString()

      const pick = (series: Record<string, number> | undefined) => {
        const v = series?.[dateKey]
        return v === undefined || v === -999 ? null : v
      }

      return {
        observedAt,
        // تحويل kWh/m^2/day إلى متوسط W/m^2 (تقريب شائع لمقارنته مع مصادر أخرى: *1000/24)
        ghiWm2: ghi === -999 ? null : Math.round((ghi * 1000) / 24 * 100) / 100,
        temperatureC: pick(props.T2M),
        windSpeedMs: pick(props.WS2M),
        humidityPct: pick(props.RH2M),
        precipitationMm: pick(props.PRECTOTCORR),
        raw: {
          date: dateKey,
          ghiKwhM2Day: ghi,
          t2m: pick(props.T2M),
          ws2m: pick(props.WS2M),
          rh2m: pick(props.RH2M),
          precip: pick(props.PRECTOTCORR),
        },
      }
    }

    return null
  } catch (error) {
    console.error('NASA POWER fetch failed:', error)
    return null
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

/** اختبار اتصال بسيط لاستخدامه في قسم التكاملات (لا يحتاج مفتاح API) */
export async function testNasaPowerConnection(): Promise<{ success: boolean; message: string }> {
  // إحداثية اختبار عامة (الرياض) — NASA POWER مجاني بالكامل، فقط نتحقق أن الخدمة تستجيب
  const result = await fetchNasaPowerLatest(24.7136, 46.6753)
  if (result) {
    return { success: true, message: `تم الاتصال بنجاح. آخر بيانات متاحة بتاريخ ${result.observedAt.slice(0, 10)}` }
  }
  return { success: false, message: 'تعذر جلب بيانات من NASA POWER API. تحقق من الاتصال بالإنترنت.' }
}
