// Reference Data Library
// Fetches versioned emission factors, tariffs, conversion factors from DB
// Falls back to hardcoded defaults only if DB tables are empty (with warning)

import { db } from './db'

// Canonical emission factor lookup by country + date
export async function getEmissionFactor(countryCode: string, date: Date = new Date()): Promise<{
  factor: number
  source: string
  version: string
  type: string
  fromDb: boolean
}> {
  // Try DB first - find factor valid for this date
  const dbFactor = await db.gridEmissionFactor.findFirst({
    where: {
      countryCode,
      validFrom: { lte: date },
      OR: [
        { validTo: null },
        { validTo: { gte: date } },
      ],
      approvalStatus: 'approved',
    },
    orderBy: { validFrom: 'desc' },
  })

  if (dbFactor) {
    return {
      factor: dbFactor.factor,
      source: dbFactor.source,
      version: dbFactor.version,
      type: dbFactor.type,
      fromDb: true,
    }
  }

  // Fallback to hardcoded defaults (with warning logged)
  const DEFAULTS: Record<string, { factor: number; source: string; version: string; type: string }> = {
    SA: { factor: 0.432, source: 'Saudi Electricity Company - 2024 (fallback)', version: 'v1.2-2024', type: 'location-based' },
    AE: { factor: 0.401, source: 'UAE Ministry of Energy - 2024 (fallback)', version: 'v1.1-2024', type: 'location-based' },
    QA: { factor: 0.410, source: 'Qatar General Electricity - 2024 (fallback)', version: 'v1.0-2024', type: 'location-based' },
    KW: { factor: 0.520, source: 'Kuwait Ministry of Electricity - 2024 (fallback)', version: 'v1.0-2024', type: 'location-based' },
    BH: { factor: 0.470, source: 'Bahrain Electricity Authority - 2024 (fallback)', version: 'v1.0-2024', type: 'location-based' },
    OM: { factor: 0.480, source: 'Oman Authority for Electricity - 2024 (fallback)', version: 'v1.0-2024', type: 'location-based' },
    EG: { factor: 0.450, source: 'Egyptian Electricity Holding - 2024 (fallback)', version: 'v1.0-2024', type: 'location-based' },
    JO: { factor: 0.480, source: 'Jordan Ministry of Energy - 2024 (fallback)', version: 'v1.0-2024', type: 'location-based' },
    PS: { factor: 0.450, source: 'Palestinian Energy Authority - 2024 (fallback)', version: 'v1.0-2024', type: 'location-based' },
  }

  const fallback = DEFAULTS[countryCode] || DEFAULTS.SA
  console.warn(`[reference-data] No DB emission factor for ${countryCode}, using fallback: ${fallback.source}`)

  return {
    ...fallback,
    fromDb: false,
  }
}

// Canonical tariff lookup by country + type + date
export async function getTariff(
  countryCode: string,
  tariffType: 'retail' | 'feed_in',
  date: Date = new Date(),
): Promise<{ rate: number; currency: string; source: string; version: string; fromDb: boolean } | null> {
  const dbTariff = await db.tariff.findFirst({
    where: {
      countryCode,
      tariffType,
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }],
      approvalStatus: 'approved',
    },
    orderBy: { validFrom: 'desc' },
  })

  if (dbTariff) {
    return {
      rate: dbTariff.rate,
      currency: dbTariff.currency,
      source: dbTariff.source,
      version: dbTariff.version,
      fromDb: true,
    }
  }

  return null // caller should use project's own tariff as fallback
}

// Canonical conversion factor lookup
export async function getConversionFactor(
  factorType: string,
  date: Date = new Date(),
): Promise<{ value: number; unit: string; source: string; version: string; fromDb: boolean }> {
  const dbFactor = await db.conversionFactor.findFirst({
    where: {
      factorType,
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }],
      approvalStatus: 'approved',
    },
    orderBy: { validFrom: 'desc' },
  })

  if (dbFactor) {
    return {
      value: dbFactor.value,
      unit: dbFactor.unit,
      source: dbFactor.source,
      version: dbFactor.version,
      fromDb: true,
    }
  }

  // Hardcoded fallbacks
  const DEFAULTS: Record<string, { value: number; unit: string; source: string; version: string }> = {
    diesel_per_kwh: { value: 0.083, unit: 'L/kWh', source: 'EPA (fallback)', version: 'v2024' },
    gas_per_kwh: { value: 0.095, unit: 'm³/kWh', source: 'IEA (fallback)', version: 'v2024' },
    tree_co2: { value: 21, unit: 'kgCO2/tree/year', source: 'EPA (fallback)', version: 'v2024' },
    car_co2_per_km: { value: 0.12, unit: 'kgCO2/km', source: 'EPA (fallback)', version: 'v2024' },
  }

  const fallback = DEFAULTS[factorType] || DEFAULTS.tree_co2
  console.warn(`[reference-data] No DB conversion factor for ${factorType}, using fallback`)

  return { ...fallback, fromDb: false }
}

// Get methodology by code
export async function getMethodology(code: string): Promise<{
  id: string
  name: string
  version: string
  frameworkRef: string | null
  fromDb: boolean
} | null> {
  const dbMethod = await db.methodology.findUnique({
    where: { code },
  })

  if (dbMethod) {
    return {
      id: dbMethod.id,
      name: dbMethod.name,
      version: dbMethod.version,
      frameworkRef: dbMethod.frameworkRef,
      fromDb: true,
    }
  }

  return null
}

// Seed reference data if tables are empty
export async function seedReferenceDataIfEmpty() {
  const efCount = await db.gridEmissionFactor.count()
  if (efCount === 0) {
    console.log('[reference-data] Seeding GridEmissionFactor table...')
    const factors = [
      { countryCode: 'SA', countryName: 'Saudi Arabia', factor: 0.432, source: 'Saudi Electricity Company', version: 'v1.2-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'AE', countryName: 'UAE', factor: 0.401, source: 'UAE Ministry of Energy', version: 'v1.1-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'QA', countryName: 'Qatar', factor: 0.410, source: 'Qatar General Electricity', version: 'v1.0-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'KW', countryName: 'Kuwait', factor: 0.520, source: 'Kuwait Ministry of Electricity', version: 'v1.0-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'BH', countryName: 'Bahrain', factor: 0.470, source: 'Bahrain Electricity Authority', version: 'v1.0-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'OM', countryName: 'Oman', factor: 0.480, source: 'Oman Authority for Electricity', version: 'v1.0-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'EG', countryName: 'Egypt', factor: 0.450, source: 'Egyptian Electricity Holding', version: 'v1.0-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'JO', countryName: 'Jordan', factor: 0.480, source: 'Jordan Ministry of Energy', version: 'v1.0-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
      { countryCode: 'PS', countryName: 'Palestine', factor: 0.450, source: 'Palestinian Energy Authority', version: 'v1.0-2024', type: 'location-based', validFrom: new Date('2024-01-01') },
    ]
    await db.gridEmissionFactor.createMany({ data: factors })
  }

  const tariffCount = await db.tariff.count()
  if (tariffCount === 0) {
    console.log('[reference-data] Seeding Tariff table...')
    const tariffs = [
      { countryCode: 'SA', tariffType: 'retail', rate: 0.18, currency: 'SAR', source: 'Saudi Electricity Regulatory Authority', version: 'v2024-1', validFrom: new Date('2024-01-01') },
      { countryCode: 'SA', tariffType: 'feed_in', rate: 0.10, currency: 'SAR', source: 'Saudi Electricity Regulatory Authority', version: 'v2024-1', validFrom: new Date('2024-01-01') },
      { countryCode: 'AE', tariffType: 'retail', rate: 0.23, currency: 'AED', source: 'DEWA', version: 'v2024-1', validFrom: new Date('2024-01-01') },
      { countryCode: 'AE', tariffType: 'feed_in', rate: 0.12, currency: 'AED', source: 'DEWA', version: 'v2024-1', validFrom: new Date('2024-01-01') },
    ]
    await db.tariff.createMany({ data: tariffs })
  }

  const cfCount = await db.conversionFactor.count()
  if (cfCount === 0) {
    console.log('[reference-data] Seeding ConversionFactor table...')
    const factors = [
      { factorType: 'diesel_per_kwh', value: 0.083, unit: 'L/kWh', source: 'EPA', version: 'v2024', validFrom: new Date('2024-01-01') },
      { factorType: 'gas_per_kwh', value: 0.095, unit: 'm³/kWh', source: 'IEA', version: 'v2024', validFrom: new Date('2024-01-01') },
      { factorType: 'tree_co2', value: 21, unit: 'kgCO2/tree/year', source: 'EPA', version: 'v2024', validFrom: new Date('2024-01-01') },
      { factorType: 'car_co2_per_km', value: 0.12, unit: 'kgCO2/km', source: 'EPA', version: 'v2024', validFrom: new Date('2024-01-01') },
    ]
    await db.conversionFactor.createMany({ data: factors })
  }

  const methodCount = await db.methodology.count()
  if (methodCount === 0) {
    console.log('[reference-data] Seeding Methodology table...')
    const methods = [
      { code: 'ghg_protocol_scope2', name: 'GHG Protocol Scope 2', nameAr: 'بروتوكول GHG - النطاق 2', version: 'Corporate Standard v2015', frameworkRef: 'GHG Protocol', validFrom: new Date('2015-01-01') },
      { code: 'iso_14064_2', name: 'ISO 14064-2', nameAr: 'أيزو 14064-2', version: '2019', frameworkRef: 'ISO', validFrom: new Date('2019-01-01') },
    ]
    await db.methodology.createMany({ data: methods })
  }
}
