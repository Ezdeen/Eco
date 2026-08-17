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

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'اسم المشروع مطلوب'),
  nameAr: nullableString,
  code: z.string().trim().min(1, 'رمز المشروع مطلوب'),
  // Restricted to the exact set of types the UI (PROJECT_TYPES in project-form-modal.tsx)
  // and the energy-performance reporting logic actually understand. Previously this was a
  // free-form string, so a typo or an unexpected value from the API would silently create
  // a project that reporting/filtering logic (e.g. `projectType: { not: 'afforestation' }`)
  // could not correctly classify.
  projectType: z.enum(['grid_tied', 'hybrid', 'off_grid', 'afforestation'], {
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
