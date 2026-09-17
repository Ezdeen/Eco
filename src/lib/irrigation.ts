// ============== محرك الري الذكي (Smart Irrigation dMRV Engine) ==============
//
// هذا الملف هو "العقل" الحسابي لمشاريع الري الذكي (projectType = 'smart_irrigation').
// يجمع ثلاثة مدخلات أساسية بنفس فلسفة المنصة (measure → verify → report):
//
//   1) عدادات مياه ذكية        → EnergyReading.metricType = 'water_flow_m3h' | 'water_meter_m3'
//   2) شبكة عصبية من مجسات الرطوبة → EnergyReading.metricType = 'soil_moisture_pct'
//      (عدة أجهزة Device مستقلة، كل واحد يمثل عقدة/مجس في الشبكة الميدانية)
//   3) موقع المشروع (lat/lon)   → SpaceDataObservation / WeatherObservation (ETo)
//
// المخرج: توصية ري (IrrigationRecommendation) قابلة للتدقيق بالكامل - كل رقم فيها
// مبني على معادلة موثّقة أدناه بالتعليقات، وليس "صندوقًا أسود". هذا ضروري لأي جهة
// تمويل أخضر أو تدقيق ESG تطالب بإثبات كيف اشتُقّ رقم "الكمية الموصى بها".
//
// ==== لماذا "شبكة عصبية" هنا وليست فقط معادلة FAO-56 مباشرة؟ ====
// الاحتياج المائي النظري (ETo × Kc) يفترض تربة/محصولاً "مثاليين". شبكة مجسات
// الرطوبة الفعلية تكشف الانحراف الحقيقي عن هذا الافتراض (نضوب أسرع/أبطأ، عدم
// تجانس الري، أعطال مجسات...). لذلك نبني شبكة أمامية التغذية بسيطة (feed-forward
// perceptron بطبقة مخفية واحدة) تُدخل: (الاحتياج النظري، متوسط رطوبة التربة الفعلي،
// نوع التربة، مدى اتفاق المجسات) وتُخرج مُعامل تصحيح على الاحتياج النظري. الأوزان
// معايرة يدويًا (لا تدريب تلقائي بعد) وموثّقة صراحة أدناه - راجع NN_WEIGHTS - بحيث
// يمكن لفريق المنهجية استبدالها بأوزان مُدرَّبة فعليًا لاحقًا دون تغيير الواجهة العامة.

// ============== 1) معاملات المحاصيل (Kc) — FAO-56 Crop Coefficient (منتصف الموسم) ==============
export const CROP_COEFFICIENTS: Record<string, { kc: number; nameAr: string }> = {
  tomato: { kc: 1.15, nameAr: 'طماطم' },
  date_palm: { kc: 0.90, nameAr: 'نخيل التمر' },
  wheat: { kc: 1.15, nameAr: 'قمح' },
  alfalfa: { kc: 0.95, nameAr: 'برسيم' },
  citrus: { kc: 0.70, nameAr: 'حمضيات' },
  olive: { kc: 0.65, nameAr: 'زيتون' },
  potato: { kc: 1.15, nameAr: 'بطاطس' },
  cucumber: { kc: 1.00, nameAr: 'خيار' },
  pepper: { kc: 1.05, nameAr: 'فلفل' },
  onion: { kc: 1.05, nameAr: 'بصل' },
  other: { kc: 1.00, nameAr: 'أخرى' },
}

// ============== 2) خصائص التربة — عامل السعة التخزينية النسبية للمياه ==============
// soilFactor > 1 يعني تربة تحتفظ بمياه أقل (رملية) فتحتاج ريًا أكثر تكرارًا؛
// < 1 يعني تربة تحتفظ بمياه أكثر (طينية) فتحتاج كمية أقل لكل دورة ري.
export const SOIL_FACTORS: Record<string, { factor: number; nameAr: string }> = {
  sandy: { factor: 1.20, nameAr: 'رملية' },
  sandy_loam: { factor: 1.10, nameAr: 'رملية طينية' },
  loamy: { factor: 1.00, nameAr: 'طميية' },
  clay_loam: { factor: 0.90, nameAr: 'طينية طميية' },
  clay: { factor: 0.80, nameAr: 'طينية' },
  silty: { factor: 0.95, nameAr: 'غرينية' },
}

export const IRRIGATION_METHOD_EFFICIENCY: Record<string, number> = {
  drip: 0.90,        // ري بالتنقيط
  subsurface: 0.92,  // ري تحت سطحي
  sprinkler: 0.75,   // رشاشات
  pivot: 0.80,       // محوري
  surface: 0.60,     // ري سطحي/غمر
}

export interface WeatherInputs {
  temperatureC: number | null
  humidityPct: number | null
  windSpeedMs: number | null
  ghiWm2: number | null // Global Horizontal Irradiance (W/m²) — يُستخدم كبديل للإشعاع الشمسي الصافي
}

// ============== 3) الاحتياج المائي المرجعي (ETo) — صيغة Hargreaves–Samani المبسّطة ==============
// نستخدم Hargreaves–Samani (وليس Penman-Monteith الكامل) لأنها لا تحتاج سوى درجة
// الحرارة + الإشعاع، وهما متوفران دومًا من SpaceDataObservation/NASA POWER، بخلاف
// Penman-Monteith الكامل الذي يحتاج ضغط بخار فعلي دقيق قد لا يتوفر لكل موقع.
// ETo (mm/day) = 0.0023 × Ra_equivalent × (Tmean + 17.8) × sqrt(TD)
// حيث Ra_equivalent مُقارَب هنا من GHI اليومي (تحويل W/m² إلى MJ/m²/day ثم إلى مكافئ تبخّري)
export function calculateETo(weather: WeatherInputs): { etoMm: number; method: string; warnings: string[] } {
  const warnings: string[] = []
  const tMean = weather.temperatureC ?? 25 // fallback معتدل عند غياب بيانات الطقس
  if (weather.temperatureC == null) warnings.push('temperatureC غير متوفر - استُخدمت قيمة افتراضية (25°C)')

  const ghi = weather.ghiWm2 ?? 220 // متوسط نموذجي لمنطقة صحراوية/شبه جافة
  if (weather.ghiWm2 == null) warnings.push('ghiWm2 غير متوفر - استُخدمت قيمة افتراضية (220 W/m²)')

  // تحويل W/m² (متوسط لحظي) إلى MJ/m²/day: × 0.0864 (86400 ثانية / 1,000,000 لتحويل J→MJ)
  const raMjM2Day = ghi * 0.0864
  // مدى حراري يومي تقديري (TD) عند غياب Tmax/Tmin فعليين: نفترض ±6°C حول tMean
  // (معقول لمناخات صحراوية مستقرة الحرارة نسبيًا) - يُستبدل لاحقًا ببيانات Tmax/Tmin
  // الفعلية إن توفرت من SpaceDataObservation مستقبلاً.
  const td = 8
  const etoMm = Math.max(0, 0.0023 * raMjM2Day * (tMean + 17.8) * Math.sqrt(td))

  return { etoMm: Math.round(etoMm * 100) / 100, method: 'hargreaves_samani_approx', warnings }
}

// ============== 4) الشبكة العصبية لمجسات الرطوبة (Feed-Forward Perceptron) ==============
// معمارية: 4 مدخلات → طبقة مخفية (3 خلايا، تفعيل ReLU) → مُخرَج واحد (تفعيل Sigmoid
// مُقيَّد إلى معامل تصحيح بين 0.5 و1.5)، يُضرَب في الاحتياج النظري (ETo × Kc × soilFactor).
//
// المدخلات (بعد التطبيع Normalization إلى مدى [0,1] تقريبًا):
//   x1 = الاحتياج النظري المُطبَّع (ETo × Kc، مُطبَّع بالقسمة على 10 مم كحد أعلى نموذجي)
//   x2 = عجز الرطوبة = (رطوبة التربة المثلى الافتراضية 60% - متوسط قراءة المجسات) / 60
//        قيمة موجبة كبيرة = تربة جافة أكثر مما ينبغي = حاجة أكبر للري
//   x3 = عامل التربة (SOIL_FACTORS) مُطبَّعًا حول 1.0
//   x4 = اتفاق المجسات (sensorAgreement 0-1) - يُستخدم للتخفيف من ثقة القرار لا لتغيير حجمه مباشرة
//
// الأوزان معايرة يدويًا لتعطي: كلما زاد عجز الرطوبة أو الاحتياج النظري، زاد معامل
// التصحيح (يوصي بريّ أكبر)؛ وكلما اتفقت المجسات وكانت التربة أفضل احتفاظًا بالماء
// قلّ التصحيح. هذا شكل صريح وقابل للتدقيق لما تُنتجه أي شبكة مُدرَّبة لاحقًا.
const NN_WEIGHTS = {
  hidden: [
    // [w_x1, w_x2, w_x3, w_x4, bias]
    [0.9, 1.4, -0.3, -0.2, 0.1],   // خلية 1: تستجيب بقوة لعجز الرطوبة والاحتياج النظري
    [0.5, 0.6, 0.4, 0.0, -0.2],    // خلية 2: تستجيب لنوع التربة + الاحتياج
    [0.2, -0.5, 0.0, 0.8, 0.0],    // خلية 3: تخفّف التصحيح عند ضعف اتفاق المجسات (بيانات غير موثوقة)
  ],
  output: [0.55, 0.35, 0.30], // أوزان الطبقة المخرجة على الخلايا المخفية الثلاث
  outputBias: -0.1,
} as const

function relu(x: number): number {
  return Math.max(0, x)
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export interface SoilMoistureNetworkInput {
  soilMoistureReadingsPct: number[] // كل قراءات مجسات الرطوبة في نافذة الفترة (بالنسبة المئوية 0-100)
  theoreticalDemandMm: number       // ETo × Kc لنفس الفترة
  soilType: string                  // مفتاح من SOIL_FACTORS
  optimalMoisturePct?: number       // الرطوبة المثلى المستهدفة (افتراضي 60%)
}

export interface SoilMoistureNetworkOutput {
  correctionFactor: number      // معامل التصحيح المُطبَّق على الاحتياج النظري (نموذجيًا 0.5-1.5)
  soilMoistureAvgPct: number
  soilMoistureMinPct: number
  soilMoistureMaxPct: number
  sensorAgreement: number       // 0-1
  hiddenActivations: number[]   // شفافية: قيم الخلايا المخفية الثلاث لهذا القرار
}

// تُشغَّل "الشبكة العصبية" على قراءات مجسات الرطوبة لإنتاج معامل تصحيح على الاحتياج
// المائي النظري. مصمَّمة لتكون شفافة بالكامل: كل قيمة وسيطة (hiddenActivations) تُعاد
// مع المخرج النهائي لأغراض التدقيق، وليست "صندوقًا أسود".
export function runSoilMoistureNeuralNetwork(input: SoilMoistureNetworkInput): SoilMoistureNetworkOutput {
  const readings = input.soilMoistureReadingsPct.filter((v) => Number.isFinite(v) && v >= 0 && v <= 100)
  const optimal = input.optimalMoisturePct ?? 60

  if (readings.length === 0) {
    // لا بيانات مجسات = لا يمكن حساب عجز فعلي؛ نعيد معامل تصحيح محايد (1.0) بثقة منخفضة
    return {
      correctionFactor: 1.0,
      soilMoistureAvgPct: 0,
      soilMoistureMinPct: 0,
      soilMoistureMaxPct: 0,
      sensorAgreement: 0,
      hiddenActivations: [0, 0, 0],
    }
  }

  const avg = readings.reduce((s, v) => s + v, 0) / readings.length
  const min = Math.min(...readings)
  const max = Math.max(...readings)

  // انحراف معياري نسبي → اتفاق المجسات (1 = اتفاق تام، 0 = تباين كبير جدًا)
  const variance = readings.reduce((s, v) => s + (v - avg) ** 2, 0) / readings.length
  const stdDev = Math.sqrt(variance)
  const relativeStdDev = avg > 0 ? stdDev / avg : 1
  const sensorAgreement = Math.max(0, Math.min(1, 1 - relativeStdDev))

  const soilFactor = SOIL_FACTORS[input.soilType]?.factor ?? 1.0

  // تطبيع المدخلات
  const x1 = Math.min(1, input.theoreticalDemandMm / 10) // 10mm/day ≈ سقف نموذجي عالٍ
  const x2 = (optimal - avg) / optimal // عجز الرطوبة، قد يكون سالبًا إن كانت التربة أرطب من المستهدف
  const x3 = soilFactor - 1.0 // حول الصفر
  const x4 = sensorAgreement

  const hiddenActivations = NN_WEIGHTS.hidden.map(([w1, w2, w3, w4, bias]) =>
    relu(w1 * x1 + w2 * x2 + w3 * x3 + w4 * x4 + bias),
  )

  const rawOutput =
    hiddenActivations[0] * NN_WEIGHTS.output[0] +
    hiddenActivations[1] * NN_WEIGHTS.output[1] +
    hiddenActivations[2] * NN_WEIGHTS.output[2] +
    NN_WEIGHTS.outputBias

  // sigmoid(rawOutput) ∈ (0,1) → نُسقطها إلى مدى معامل تصحيح [0.5, 1.5]
  const correctionFactor = 0.5 + sigmoid(rawOutput) * 1.0

  return {
    correctionFactor: Math.round(correctionFactor * 1000) / 1000,
    soilMoistureAvgPct: Math.round(avg * 100) / 100,
    soilMoistureMinPct: Math.round(min * 100) / 100,
    soilMoistureMaxPct: Math.round(max * 100) / 100,
    sensorAgreement: Math.round(sensorAgreement * 1000) / 1000,
    hiddenActivations: hiddenActivations.map((v) => Math.round(v * 1000) / 1000),
  }
}

// ============== 5) حساب التوصية الكاملة (Volume-Based) ==============
export interface IrrigationRecommendationInput {
  soilMoistureReadingsPct: number[]
  weather: WeatherInputs
  cropType: string
  soilType: string
  irrigatedAreaM2: number
  irrigationMethod?: string | null
}

export interface IrrigationRecommendationResult {
  etoMm: number
  etoMethod: string
  cropCoefficientKc: number
  theoreticalDemandMm: number
  correctionFactor: number
  netDemandMm: number
  irrigationEfficiency: number
  recommendedIrrigationM3: number
  confidenceScore: number
  soilMoistureAvgPct: number
  soilMoistureMinPct: number
  soilMoistureMaxPct: number
  sensorAgreement: number
  sensorReadingCount: number
  warnings: string[]
}

export function computeIrrigationRecommendation(input: IrrigationRecommendationInput): IrrigationRecommendationResult {
  const { etoMm, method, warnings } = calculateETo(input.weather)
  const kc = CROP_COEFFICIENTS[input.cropType]?.kc ?? CROP_COEFFICIENTS.other.kc
  const theoreticalDemandMm = etoMm * kc

  const nn = runSoilMoistureNeuralNetwork({
    soilMoistureReadingsPct: input.soilMoistureReadingsPct,
    theoreticalDemandMm,
    soilType: input.soilType,
  })

  if (input.soilMoistureReadingsPct.length === 0) {
    warnings.push('لا توجد قراءات من شبكة مجسات الرطوبة لهذه الفترة - التوصية مبنية على الاحتياج النظري فقط بثقة منخفضة')
  }

  const netDemandMm = theoreticalDemandMm * nn.correctionFactor

  // كفاءة طريقة الري: الكمية الإجمالية المطلوبة عند مصدر الماء أكبر من الاحتياج
  // الصافي بسبب الفاقد (تبخّر، جريان سطحي، عدم انتظام التوزيع)
  const efficiency = (input.irrigationMethod && IRRIGATION_METHOD_EFFICIENCY[input.irrigationMethod]) || 0.75
  const grossDemandMm = netDemandMm / efficiency

  // تحويل من مم إلى م³: 1 مم على 1 م² = 1 لتر = 0.001 م³
  const recommendedIrrigationM3 = (grossDemandMm * input.irrigatedAreaM2) / 1000

  // الثقة: اتفاق المجسات × تغطية عدد القراءات (تزداد الثقة مع توفر 3 قراءات فأكثر)
  const coverageFactor = Math.min(1, input.soilMoistureReadingsPct.length / 3)
  const confidenceScore = input.soilMoistureReadingsPct.length > 0
    ? Math.round(nn.sensorAgreement * coverageFactor * 1000) / 1000
    : 0.2 // ثقة دنيا ثابتة عند الاعتماد على الاحتياج النظري فقط دون مجسات

  return {
    etoMm,
    etoMethod: method,
    cropCoefficientKc: kc,
    theoreticalDemandMm: Math.round(theoreticalDemandMm * 100) / 100,
    correctionFactor: nn.correctionFactor,
    netDemandMm: Math.round(netDemandMm * 100) / 100,
    irrigationEfficiency: efficiency,
    recommendedIrrigationM3: Math.round(recommendedIrrigationM3 * 100) / 100,
    confidenceScore,
    soilMoistureAvgPct: nn.soilMoistureAvgPct,
    soilMoistureMinPct: nn.soilMoistureMinPct,
    soilMoistureMaxPct: nn.soilMoistureMaxPct,
    sensorAgreement: nn.sensorAgreement,
    sensorReadingCount: input.soilMoistureReadingsPct.length,
    warnings,
  }
}

// ============== 6) التوفير المائي والأثر البيئي المشتق ==============
export interface WaterSavingsResult {
  actualM3: number
  baselineM3: number
  savedM3: number
  savedPct: number
  costSaved: number | null
  pumpingEnergyKwhSaved: number | null
  co2AvoidedKg: number | null
}

// يقارن الاستهلاك الفعلي (من عداد المياه الذكي) بخط الأساس (إما dailyWaterBudget
// المُدخل عند إنشاء المشروع، أو baselineWaterUseLM2Day × المساحة المروية × عدد الأيام)
export function calculateWaterSavings(params: {
  actualM3: number
  baselineM3: number
  waterTariffPerM3?: number | null
  pumpEnergyKwhPerM3?: number | null
  emissionFactorKgPerKwh?: number | null
}): WaterSavingsResult {
  const { actualM3, baselineM3 } = params
  const savedM3 = Math.max(0, baselineM3 - actualM3)
  const savedPct = baselineM3 > 0 ? (savedM3 / baselineM3) * 100 : 0

  const costSaved = params.waterTariffPerM3 != null ? Math.round(savedM3 * params.waterTariffPerM3 * 100) / 100 : null

  const pumpingEnergyKwhSaved = params.pumpEnergyKwhPerM3 != null
    ? Math.round(savedM3 * params.pumpEnergyKwhPerM3 * 100) / 100
    : null

  const co2AvoidedKg = pumpingEnergyKwhSaved != null && params.emissionFactorKgPerKwh != null
    ? Math.round(pumpingEnergyKwhSaved * params.emissionFactorKgPerKwh * 100) / 100
    : null

  return {
    actualM3: Math.round(actualM3 * 100) / 100,
    baselineM3: Math.round(baselineM3 * 100) / 100,
    savedM3: Math.round(savedM3 * 100) / 100,
    savedPct: Math.round(savedPct * 100) / 100,
    costSaved,
    pumpingEnergyKwhSaved,
    co2AvoidedKg,
  }
}

// خط الأساس الافتراضي عند غياب dailyWaterBudgetM3: يعتمد على baselineWaterUseLM2Day
// (لتر/م²/يوم) المُدخل عند إنشاء المشروع، أو قيمة افتراضية نموذجية للري السطحي التقليدي
// (6 لتر/م²/يوم - نموذجي لمناخ صحراوي/شبه جاف بدون تحكم ذكي)
export function estimateBaselineWaterUseM3(params: {
  irrigatedAreaM2: number
  days: number
  dailyWaterBudgetM3?: number | null
  baselineWaterUseLM2Day?: number | null
}): number {
  if (params.dailyWaterBudgetM3 != null && params.dailyWaterBudgetM3 > 0) {
    return params.dailyWaterBudgetM3 * params.days
  }
  const lM2Day = params.baselineWaterUseLM2Day ?? 6
  return (lM2Day * params.irrigatedAreaM2 * params.days) / 1000
}
