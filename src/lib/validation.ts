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

  currency: z.string().trim().default('SAR'),
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
