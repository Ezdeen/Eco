import { z } from 'zod'

const emptyStringToUndefined = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}, z.string().trim().optional())

const nullableString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value
}, z.string().nullable().optional())

const numericOrNull = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}, z.number().finite().nullable().optional())

const intOrNull = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}, z.number().int().positive().nullable().optional())

export const loginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

export const registerSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  name: nullableString,
  nameAr: nullableString,
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
})

// حاسبة القرض الأخضر الشمسي (public lead-gen calculator) - بوابة النموذج الكامل
export const solarCalculatorLeadSchema = z
  .object({
    fullName: z.string().trim().min(2, 'الاسم الكامل مطلوب').max(200),
    email: z.string().trim().email('بريد إلكتروني غير صالح').max(320),
    phone: z.string().trim().max(40).optional().or(z.literal('')),
    companyName: z.string().trim().max(200).optional().or(z.literal('')),
    userType: z.enum(['individual', 'sme']),
    countryCode: z.string().trim().length(2).default('SA'),
    locale: z.enum(['ar', 'en']).default('ar'),
    monthlyElectricityBill: z.number().finite().positive().max(10_000_000),
    estimatedSystemCostOverride: z.number().finite().positive().max(100_000_000).nullable().optional(),
    loanPercent: z.number().finite().min(0).max(100),
    loanTermYears: z.number().int().min(1).max(10),
    loanInterestRatePct: z.number().finite().min(0).max(50),
    savingsRatio: z.number().finite().min(0.5).max(0.95).optional(),
    utmSource: z.string().trim().max(200).optional(),
    utmCampaign: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.userType !== 'sme' || (data.companyName && data.companyName.trim().length > 0), {
    message: 'اسم المنشأة مطلوب لعملاء الشركات الصغيرة والمتوسطة (SME)',
    path: ['companyName'],
  })

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'اسم المشروع مطلوب'),
  nameAr: nullableString,
  code: z.string().trim().min(1, 'رمز المشروع مطلوب'),
  // Restricted to the exact set of types the UI (PROJECT_TYPES in project-form-modal.tsx)
  // and the energy-performance reporting logic actually understand. Previously this was a
  // free-form string, so a typo or an unexpected value from the API would silently create
  // a project that reporting/filtering logic (e.g. `projectType: { not: 'afforestation' }`)
  // could not correctly classify.
  projectType: z.enum(['grid_tied', 'hybrid', 'off_grid', 'afforestation', 'smart_irrigation'], {
    error: 'نوع المشروع غير صالح',
  }).default('grid_tied'),

  country: nullableString,
  city: nullableString,
  latitude: numericOrNull,
  longitude: numericOrNull,
  timezone: nullableString,

  sponsorName: nullableString,
  sponsorPhone: nullableString,
  managerId: nullableString,

  currency: z.string().trim().default('ILS'),
  capacityKwp: numericOrNull,
  tariffRetail: numericOrNull,
  tariffFeedIn: numericOrNull,

  inverterSerial: nullableString,
  inverterType: nullableString,

  treeSpecies: nullableString,
  treeCount: intOrNull,
  plantedAreaM2: numericOrNull,
  plantingDate: nullableString,
  survivalRateTarget: numericOrNull,

  iotSensorType: nullableString,
  iotSensorModel: nullableString,
  iotSensorSerial: nullableString,
  iotGatewayId: nullableString,
  iotProtocol: nullableString,
  iotDataFrequency: nullableString,

  // أجهزة/مجسات إضافية تُنشأ دفعة واحدة عند إنشاء المشروع (مثال: بقية عقد
  // شبكة مجسات الرطوبة لمشروع الري الذكي، أو مستشعرات إضافية لمشروع تشجير).
  // كل عنصر يُنشئ سجل Device مستقل مرتبط بأصل المشروع.
  additionalIotSensors: z.array(z.object({
    sensorType: nullableString,
    model: nullableString,
    serial: z.string().trim().min(1, 'سيريال المستشعر مطلوب'),
    gatewayId: nullableString,
    protocol: nullableString,
    dataFrequency: nullableString,
  })).optional().default([]),

  // Smart irrigation fields (projectType = 'smart_irrigation')
  // عداد المياه الذكي الرئيسي - بنفس نمط inverterSerial/inverterType تمامًا لمشاريع الطاقة الشمسية
  waterMeterSerial: nullableString,
  waterMeterType: nullableString,
  cropType: nullableString,
  irrigatedAreaM2: numericOrNull,
  irrigationMethod: nullableString,
  soilType: nullableString,
  waterSourceType: nullableString,
  dailyWaterBudgetM3: numericOrNull,
  baselineWaterUseLM2Day: numericOrNull,
  waterTariffPerM3: numericOrNull,
  pumpEnergyKwhPerM3: numericOrNull,
}).strict()

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: nullableString,
  commissionedAt: nullableString,
})

// ============== نسب التمويل والإسناد (Project Funders / Attribution) ==============

export const createProjectFunderSchema = z.object({
  funderName: z.string().trim().min(1, 'اسم الممول مطلوب'),
  funderNameAr: nullableString,
  fundingAmount: numericOrNull,
  projectTotalValue: numericOrNull,
  // attributionShare is optional on input: when fundingAmount + projectTotalValue
  // are both provided and attributionMethod is 'capital_share' (the default), the
  // server computes it via PCAF's capital-share formula instead of trusting a
  // client-supplied number. It is required when attributionMethod is 'manual'.
  attributionShare: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') return undefined
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : value
    }
    return value
  }, z.number().min(0, 'النسبة يجب أن تكون بين 0 و1').max(1, 'النسبة يجب أن تكون بين 0 و1').optional()),
  attributionMethod: z.enum(['capital_share', 'manual']).default('capital_share'),
  attributionNote: nullableString,
  currency: nullableString,
  isActive: z.boolean().default(true),
  effectiveFrom: nullableString,
  effectiveTo: nullableString,
}).strict().superRefine((data, ctx) => {
  if (data.attributionMethod === 'manual') {
    if (data.attributionShare === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['attributionShare'],
        message: 'نسبة الإسناد مطلوبة عند اختيار الإدخال اليدوي',
      })
    }
    if (!data.attributionNote || data.attributionNote.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['attributionNote'],
        message: 'يجب توضيح سبب الإدخال اليدوي لنسبة الإسناد',
      })
    }
  } else {
    // capital_share
    const hasAmounts = data.fundingAmount != null && data.projectTotalValue != null
    if (!hasAmounts && data.attributionShare === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['fundingAmount'],
        message: 'أدخل مبلغ التمويل وقيمة المشروع الإجمالية، أو أدخل نسبة الإسناد يدويًا',
      })
    }
    if (data.projectTotalValue != null && data.projectTotalValue <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectTotalValue'],
        message: 'القيمة الإجمالية للمشروع يجب أن تكون أكبر من صفر',
      })
    }
  }
})

export const updateProjectFunderSchema = z.object({
  funderName: z.string().trim().min(1).optional(),
  funderNameAr: nullableString,
  fundingAmount: numericOrNull,
  projectTotalValue: numericOrNull,
  attributionShare: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') return undefined
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : value
    }
    return value
  }, z.number().min(0).max(1).optional()),
  attributionMethod: z.enum(['capital_share', 'manual']).optional(),
  attributionNote: nullableString,
  currency: nullableString,
  isActive: z.boolean().optional(),
  effectiveFrom: nullableString,
  effectiveTo: nullableString,
}).strict()

export const ingestionSchema = z.object({
  projectId: z.string().min(1, 'projectId مطلوب'),
  readings: z.array(z.object({
    deviceId: z.string().optional(),
    siteId: z.string().optional(),
    assetId: z.string().optional(),
    metricType: z.string().default('energy_export_kwh'),
    measuredAt: z.string(),
    intervalStart: z.string().optional(),
    intervalEnd: z.string().optional(),
    value: z.union([z.string(), z.number()]),
    unit: z.string().default('kWh'),
    cumulativeValue: z.union([z.string(), z.number()]).optional(),
    sourceEventId: z.string().optional(),
  })).min(1, 'قراءة واحدة على الأقل مطلوبة'),
  idempotencyKey: z.string().optional(),
  source: z.string().optional(),
})

export const attestationSchema = z.object({
  projectId: z.string().min(1, 'projectId مطلوب'),
  readings: z.array(z.any()).min(1, 'قراءة واحدة على الأقل مطلوبة'),
  methodologyVersion: z.string().optional(),
})

export const calculationSchema = z.object({
  projectId: z.string().min(1, 'projectId مطلوب'),
  periodStart: z.string().min(1, 'periodStart مطلوب'),
  periodEnd: z.string().min(1, 'periodEnd مطلوب'),
  methodologyVersion: z.string().optional(),
})

// ============== خط الأساس البيئي (dMRV Baseline Impact Calculator) ==============

// فاتورة تاريخية واحدة (الشهر/السنة/المبلغ) - عنصر الجدول القابل للإضافة/التعديل/الحذف
const monthField = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return value
}, z.number().int('الشهر يجب أن يكون رقمًا صحيحًا').min(1, 'الشهر بين 1 و12').max(12, 'الشهر بين 1 و12'))

const yearField = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return value
}, z.number().int('السنة يجب أن تكون رقمًا صحيحًا').min(2000, 'سنة غير منطقية').max(2100, 'سنة غير منطقية'))

const amountField = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return value
}, z.number({ error: 'المبلغ مطلوب' }).positive('المبلغ يجب أن يكون أكبر من صفر'))

export const createProjectBaselineInvoiceSchema = z.object({
  category: z.enum(['RENEWABLE_ENERGY', 'WATER_SUSTAINABILITY'], {
    error: 'الفئة يجب أن تكون RENEWABLE_ENERGY أو WATER_SUSTAINABILITY',
  }),
  month: monthField,
  year: yearField,
  amount: amountField,
}).strict()

export const updateProjectBaselineInvoiceSchema = z.object({
  month: monthField.optional(),
  year: yearField.optional(),
  amount: amountField.optional(),
}).strict()

// احتساب خط الأساس: يعتمد على مجموع الفواتير المُدخلة مسبقًا كجدول (شهر/سنة/مبلغ) بدل
// متوسط شهري تقديري - راجع src/app/api/projects/[id]/baseline/route.ts لمنطق التجميع.
// baselinePeriodMonths يبقى اختياريًا هنا: يُستخدم فقط لمسار "قدرة المضخة" (بلا فواتير)،
// أما مسار الفواتير فيُشتق عدد الأشهر تلقائيًا من عدد الفواتير المحفوظة لتلك الفئة.
export const createProjectBaselineSchema = z.object({
  category: z.enum(['RENEWABLE_ENERGY', 'WATER_SUSTAINABILITY'], {
    error: 'الفئة يجب أن تكون RENEWABLE_ENERGY أو WATER_SUSTAINABILITY',
  }),
  baselinePeriodMonths: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() !== '') return Number(value)
    return value
  }, z.number().int('عدد الأشهر يجب أن يكون رقمًا صحيحًا').min(1, 'يجب إدخال شهر واحد على الأقل').max(60, 'الحد الأقصى 60 شهرًا')).optional(),

  // الفئة أ: الطاقة المتجددة
  electricityRate: numericOrNull,
  gridRegionOrCountry: nullableString,

  // الفئة ب: استدامة المياه
  waterRatePerLiter: numericOrNull,
  pumpOperatingHoursPerDay: numericOrNull,
  pumpPowerCapacityKw: numericOrNull,
  pumpEnergyKwhPerM3: numericOrNull,
  landAreaValue: numericOrNull,
  landAreaUnit: z.enum(['sqm', 'hectares']).default('sqm'),
  cropType: nullableString,
}).strict().superRefine((data, ctx) => {
  if (data.category === 'RENEWABLE_ENERGY') {
    if (data.electricityRate == null || data.electricityRate <= 0) {
      ctx.addIssue({ code: 'custom', path: ['electricityRate'], message: 'تعرفة الكهرباء لكل kWh مطلوبة ويجب أن تكون أكبر من صفر' })
    }
    if (!data.gridRegionOrCountry) {
      ctx.addIssue({ code: 'custom', path: ['gridRegionOrCountry'], message: 'الدولة/المنطقة مطلوبة لتحديد معامل انبعاثات الشبكة' })
    }
  } else {
    // WATER_SUSTAINABILITY: إما فواتير مياه (تتطلب تعرفة اللتر فقط هنا؛ وجود الفواتير نفسها
    // يُتحقَّق منه في الـ API لأنه يعتمد على قاعدة البيانات) أو بيانات مضخة كاملة
    const hasWaterRate = data.waterRatePerLiter != null && data.waterRatePerLiter > 0
    const hasPumpData = data.pumpPowerCapacityKw != null && data.pumpPowerCapacityKw > 0 && data.pumpOperatingHoursPerDay != null && data.pumpOperatingHoursPerDay > 0
    if (!hasWaterRate && !hasPumpData) {
      ctx.addIssue({
        code: 'custom',
        path: ['waterRatePerLiter'],
        message: 'أدخل إما تعرفة المياه لكل لتر (لاستخدام الفواتير المُدخلة)، أو قدرة المضخة وساعات التشغيل اليومية',
      })
    }
    if (hasPumpData && (data.baselinePeriodMonths == null)) {
      ctx.addIssue({ code: 'custom', path: ['baselinePeriodMonths'], message: 'عدد الأشهر مطلوب عند الاحتساب عبر قدرة المضخة' })
    }
    if (data.landAreaValue == null || data.landAreaValue <= 0) {
      ctx.addIssue({ code: 'custom', path: ['landAreaValue'], message: 'مساحة الأرض المروية مطلوبة ويجب أن تكون أكبر من صفر' })
    }
    if (!data.gridRegionOrCountry) {
      ctx.addIssue({ code: 'custom', path: ['gridRegionOrCountry'], message: 'الدولة/المنطقة مطلوبة لتحديد معامل انبعاثات الشبكة (أثر طاقة الضخ)' })
    }
  }
})

export const portfolioReportSchema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  periodStart: z.string().min(1, 'periodStart مطلوب'),
  periodEnd: z.string().min(1, 'periodEnd مطلوب'),
  projectIds: z.array(z.string()).optional(), // فارغة/غائبة = كل مشاريع المنظمة
  methodologyNote: z.string().optional(),
})
