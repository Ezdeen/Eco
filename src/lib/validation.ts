import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
})

export const registerSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  name: z.string().min(1, 'الاسم مطلوب'),
  nameAr: z.string().optional(),
})

export const createProjectSchema = z.object({
  name: z.string().min(1, 'اسم المشروع مطلوب'),
  nameAr: z.string().optional(),
  code: z.string().min(1, 'رمز المشروع مطلوب'),
  country: z.string().min(1, 'الدولة مطلوبة'),
  city: z.string().min(1, 'المدينة مطلوبة'),
  latitude: z.string().or(z.number()),
  longitude: z.string().or(z.number()),
  projectType: z.enum(['grid_tied', 'hybrid', 'off_grid', 'afforestation']).default('grid_tied'),
  inverterSerial: z.string().nullish(),
  inverterType: z.string().nullish(),
  currency: z.string().default('SAR'),
  capacityKwp: z.string().or(z.number()).nullish(),
  sponsorName: z.string().nullish(),
  sponsorPhone: z.string().nullish(),
  managerId: z.string().nullish(),
  // Afforestation
  treeSpecies: z.string().nullish(),
  treeCount: z.string().or(z.number()).nullish(),
  plantedAreaM2: z.string().or(z.number()).nullish(),
  plantingDate: z.string().nullish(),
  survivalRateTarget: z.string().or(z.number()).nullish(),
  // IoT
  iotSensorType: z.string().nullish(),
  iotSensorModel: z.string().nullish(),
  iotSensorSerial: z.string().nullish(),
  iotGatewayId: z.string().nullish(),
  iotProtocol: z.string().nullish(),
  iotDataFrequency: z.string().nullish(),
  // Financial
  tariffRetail: z.string().or(z.number()).nullish(),
  tariffFeedIn: z.string().or(z.number()).nullish(),
  timezone: z.string().nullish(),
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
