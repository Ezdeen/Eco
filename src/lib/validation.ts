import { z } from 'zod'
  plantedAreaM2: numericOrNull,
  plantingDate: emptyStringToNull.pipe(z.string().nullish()),
  survivalRateTarget: numericOrNull,
  // IoT
  iotSensorType: emptyStringToNull.pipe(z.string().nullish()),
  iotSensorModel: emptyStringToNull.pipe(z.string().nullish()),
  iotSensorSerial: emptyStringToNull.pipe(z.string().nullish()),
  iotGatewayId: emptyStringToNull.pipe(z.string().nullish()),
  iotProtocol: emptyStringToNull.pipe(z.string().nullish()),
  iotDataFrequency: emptyStringToNull.pipe(z.string().nullish()),
  // Financial
  tariffRetail: numericOrNull,
  tariffFeedIn: numericOrNull,
  timezone: emptyStringToNull.pipe(z.string().nullish()),
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
