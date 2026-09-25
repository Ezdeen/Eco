// ============== حاسبة خط الأساس البيئي لـ SMEs (dMRV Baseline Impact Calculator) ==============
//
// هذا الملف هو "العقل" الحسابي لميزة تسجيل خط الأساس (Before State) لمشروع قائم مسبقًا
// (Legacy) ينتقل إلى حل أخضر (طاقة شمسية أو ري ذكي). الهدف: تمكين مقارنة "قبل مقابل بعد"
// موثوقة دون فرض أي عبء مالي على المنشأة الصغيرة/المتوسطة - المدخلات هنا فواتير تاريخية
// موجودة أصلاً لدى المنشأة (فاتورة كهرباء/مياه)، لا عدادات ذكية جديدة.
//
// يعتمد هذا الملف على نفس البنية التحتية المرجعية المستخدمة في بقية المنصة
// (src/lib/reference-data.ts لمعامل انبعاثات الشبكة) حتى يبقى الرقم قابلاً للتدقيق ومرتبطًا
// بمصدر ونسخة موثقين (Grid Emission Factor)، تمامًا كما تحسب المنصة أثر "ما بعد" التركيب.
//
// المعادلات مطابقة لمعايير GHG Protocol (Scope 2) وISO 14046 (Water Footprint)، كما وردت في
// منهجية حاسبة خط الأساس المعتمدة (راجع التعليقات أعلى كل دالة للمرجع الدقيق).

export type BaselineCategory = 'RENEWABLE_ENERGY' | 'WATER_SUSTAINABILITY'

export interface EnergyBaselineInput {
  monthlyElectricityBill: number // بعملة المشروع
  electricityRate: number        // بعملة المشروع لكل kWh
  timePeriodMonths: number
  emissionFactorKgPerKwh: number // Grid Emission Factor (kgCO2e/kWh)
}

export interface EnergyBaselineResult {
  totalEnergyKwh: number
  baselineCo2eTons: number
}

// ============== 1) الطاقة والانبعاثات الكربونية (GHG Protocol - Scope 2) ==============
//
//   kWh_consumed = إجمالي قيمة الفاتورة / تعرفة الكهرباء لكل kWh
//   tCO2e_baseline = (kWh_consumed × Grid Emission Factor) / 1000
//
// إجمالي قيمة الفاتورة = الفاتورة الشهرية × عدد الأشهر التاريخية المُدخلة، حتى يمثّل
// المستخدم فترة رصد كاملة (12 شهرًا عادة) بدل شهر واحد فقط، ما يقلل أثر التذبذب الموسمي.
export function computeEnergyBaseline(input: EnergyBaselineInput): EnergyBaselineResult {
  const { monthlyElectricityBill, electricityRate, timePeriodMonths, emissionFactorKgPerKwh } = input

  if (electricityRate <= 0) {
    throw new Error('تعرفة الكهرباء يجب أن تكون أكبر من صفر لاحتساب الاستهلاك')
  }

  const totalBillValue = monthlyElectricityBill * timePeriodMonths
  const totalEnergyKwh = totalBillValue / electricityRate
  const baselineCo2eTons = (totalEnergyKwh * emissionFactorKgPerKwh) / 1000

  return {
    totalEnergyKwh: round(totalEnergyKwh),
    baselineCo2eTons: round(baselineCo2eTons),
  }
}

export interface WaterBaselineInput {
  timePeriodMonths: number
  emissionFactorKgPerKwh: number
  landAreaSqm: number // بعد تحويل الهكتار إلى م² إن لزم (انظر convertLandAreaToSqm)
  // طريقة 1: عبر فاتورة المياه (الأبسط - لا تحتاج تفاصيل تقنية عن المضخة)
  waterBill?: number | null
  waterRatePerLiter?: number | null
  // طريقة 2: عبر ساعات تشغيل المضخة وقدرتها (عندما لا تتوفر فاتورة مياه منفصلة،
  // كحال كثير من المزارع التي تعتمد على بئر خاص بدل شبكة مياه بلدية)
  pumpOperatingHoursPerDay?: number | null
  pumpPowerCapacityKw?: number | null
  pumpEnergyKwhPerM3?: number | null // كثافة طاقة الضخ (kWh لكل م³) - لازمة لاشتقاق الحجم من الطاقة
}

export interface WaterBaselineResult {
  totalWaterLiters: number
  waterIntensityPerSqm: number
  pumpingCo2eTons: number | null
  method: 'water_bill' | 'pump_capacity'
  warnings: string[]
}

// ============== 2) أثر المياه وترابط الطاقة-المياه (ISO 14046 & FAO CROPWAT) ==============
//
//   الطريقة 1 (فاتورة المياه):     Water_volume = إجمالي فاتورة المياه / تعرفة اللتر
//   الطريقة 2 (قدرة المضخة):      Pump_kWh = قدرة المضخة (kW) × ساعات التشغيل اليومية × الأيام
//                                  Water_volume (م³) = Pump_kWh / كثافة طاقة الضخ (kWh/م³)
//   مؤشر كثافة المياه:            Liters / m²
//   الكربون المتضمّن في الضخ:     tCO2e = (Pump_kWh × Grid/Diesel Factor) / 1000
//
// تُفضَّل الطريقة 1 عند توفرها (أدق وأبسط للمنشأة). تُستخدم الطريقة 2 فقط عند غياب فاتورة
// مياه منفصلة، وتتطلب pumpEnergyKwhPerM3 لاشتقاق الحجم؛ في غيابها يُعاد حجم = 0 مع تحذير
// صريح بدل رقم ملفّق، حفاظًا على مصداقية dMRV (لا "صندوق أسود").
export function computeWaterBaseline(input: WaterBaselineInput): WaterBaselineResult {
  const warnings: string[] = []
  const days = Math.round(input.timePeriodMonths * 30)

  let totalWaterLiters = 0
  let pumpKwh: number | null = null
  let method: WaterBaselineResult['method'] = 'water_bill'

  const hasWaterBill = input.waterBill != null && input.waterBill > 0
    && input.waterRatePerLiter != null && input.waterRatePerLiter > 0

  if (hasWaterBill) {
    const totalWaterBillValue = (input.waterBill as number) * input.timePeriodMonths
    totalWaterLiters = totalWaterBillValue / (input.waterRatePerLiter as number)
    method = 'water_bill'
  } else if (input.pumpPowerCapacityKw != null && input.pumpOperatingHoursPerDay != null) {
    method = 'pump_capacity'
    pumpKwh = input.pumpPowerCapacityKw * input.pumpOperatingHoursPerDay * days

    if (input.pumpEnergyKwhPerM3 != null && input.pumpEnergyKwhPerM3 > 0) {
      const volumeM3 = pumpKwh / input.pumpEnergyKwhPerM3
      totalWaterLiters = volumeM3 * 1000
    } else {
      warnings.push(
        'تعذّر اشتقاق حجم المياه من قدرة المضخة لغياب كثافة طاقة الضخ (kWh/م³)؛ ' +
        'أُدخل حجم المياه كصفر وتم الاكتفاء باحتساب الأثر الكربوني لطاقة الضخ فقط. ' +
        'يُنصح بإدخال فاتورة المياه مباشرة أو تزويد كثافة طاقة الضخ للحصول على حجم دقيق.',
      )
    }
  } else {
    warnings.push('لا تتوفر بيانات كافية (فاتورة مياه أو قدرة/ساعات تشغيل مضخة) لاحتساب حجم المياه.')
  }

  const pumpingCo2eTons = pumpKwh != null
    ? round((pumpKwh * input.emissionFactorKgPerKwh) / 1000)
    : null

  const waterIntensityPerSqm = input.landAreaSqm > 0
    ? round(totalWaterLiters / input.landAreaSqm)
    : 0

  return {
    totalWaterLiters: round(totalWaterLiters),
    waterIntensityPerSqm,
    pumpingCo2eTons,
    method,
    warnings,
  }
}

// تحويل المساحة إلى م² بحسب الوحدة المُدخلة (المنصة تعمل داخليًا بالمتر المربع في كل مكان
// آخر - Project.irrigatedAreaM2، Project.plantedAreaM2 - لذا نوحّد هنا أيضًا)
export function convertLandAreaToSqm(value: number, unit: 'sqm' | 'hectares'): number {
  return unit === 'hectares' ? value * 10000 : value
}

// ============== المعايير المرجعية وربط dMRV/ESG (لكل فئة) ==============

export const STANDARDS_APPLIED: Record<BaselineCategory, string[]> = {
  RENEWABLE_ENERGY: [
    'GHG Protocol Scope 2',
    'IEA Regional Grid Emission Factors',
  ],
  WATER_SUSTAINABILITY: [
    'ISO 14046 Water Footprint',
    'FAO Water Management Guidelines (CROPWAT)',
    'GHG Protocol Scope 1/2 (Embedded Pumping Emissions)',
  ],
}

export const ESG_ALIGNMENT: Record<BaselineCategory, { griStandards: string[]; sdgGoals: string[] }> = {
  RENEWABLE_ENERGY: {
    griStandards: ['GRI 302: Energy', 'GRI 305: Emissions'],
    sdgGoals: ['SDG 7: Affordable and Clean Energy', 'SDG 13: Climate Action'],
  },
  WATER_SUSTAINABILITY: {
    griStandards: ['GRI 303: Water and Effluents', 'GRI 305: Emissions'],
    sdgGoals: ['SDG 6: Clean Water and Sanitation', 'SDG 13: Climate Action'],
  },
}

export function buildDmrvLinkageNotes(category: BaselineCategory): string {
  if (category === 'RENEWABLE_ENERGY') {
    return (
      'يمثّل هذا الأساس استهلاك الشبكة قبل تركيب النظام الشمسي، مُشتقًا من فواتير كهرباء ' +
      'تاريخية. بعد التشغيل، تُقارَن قراءات إنفرتر/عداد المشروع الفعلية الموثّقة على Hedera ' +
      '(EnergyReading metricType=energy_export_kwh عبر /api/integrations/inverter) بهذا ' +
      'الأساس لإنتاج مقارنة Before-vs-After ولحساب الكربون المُتجنَّب الفعلي (CalculationRun).'
    )
  }
  return (
    'يمثّل هذا الأساس استهلاك المياه/طاقة الضخ التقليدي قبل اعتماد الري الذكي، مُشتقًا من ' +
    'فاتورة المياه أو من قدرة وساعات تشغيل المضخة. بعد التشغيل، تُقارَن قراءات عداد المياه ' +
    'الذكي الفعلية الموثّقة على Hedera (EnergyReading metricType=water_meter_m3 عبر ' +
    '/api/integrations/water-meter) بهذا الأساس عبر calculateWaterSavings لاحتساب التوفير ' +
    'الفعلي في المياه والطاقة والكربون.'
  )
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
