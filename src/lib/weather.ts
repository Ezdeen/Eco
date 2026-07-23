// Weather Integration Library
// Connects to Open-Meteo API for solar irradiance and weather data
// Used for expected yield and Performance Ratio calculations

import { db } from './db'

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

export interface WeatherData {
  temperatureC: number
  humidityPct: number
  irradianceWm2: number
  windSpeedMs: number
  cloudCoverPct: number
  precipitationMm: number
}

export interface LiveWeatherData {
  observedAt: string // ISO timestamp reported by Open-Meteo for this reading
  temperatureC: number | null
  humidityPct: number | null
  windSpeedMs: number | null
  cloudCoverPct: number | null
  irradianceWm2: number | null // shortwave solar radiation, instantaneous, in W/m²
  isDay: boolean | null
  weatherCode: number | null
  source: 'Open-Meteo'
}

// Fetch current (live) weather + solar irradiance for a project's coordinates.
// Uses Open-Meteo's `current=` parameter (instantaneous values), which is a
// different endpoint shape than the daily historical fetch below used for
// expected-yield calculations. No API key is required — Open-Meteo's free tier
// is unauthenticated for non-commercial use.
export async function fetchLiveWeather(
  latitude: number,
  longitude: number,
): Promise<LiveWeatherData | null> {
  try {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      current: 'temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m,shortwave_radiation,is_day,weather_code',
      timezone: 'auto',
    })

    const url = `${OPEN_METEO_URL}?${params}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      // Live weather changes constantly; avoid any accidental caching layer serving stale data.
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('Open-Meteo current weather API error:', response.status)
      return null
    }

    const data = await response.json()
    const current = data.current

    if (!current) return null

    return {
      observedAt: current.time,
      temperatureC: current.temperature_2m ?? null,
      humidityPct: current.relative_humidity_2m ?? null,
      windSpeedMs: current.wind_speed_10m ?? null,
      cloudCoverPct: current.cloud_cover ?? null,
      irradianceWm2: current.shortwave_radiation ?? null,
      isDay: current.is_day === 1,
      weatherCode: current.weather_code ?? null,
      source: 'Open-Meteo',
    }
  } catch (error) {
    console.error('Live weather fetch error:', error)
    return null
  }
}

// Fetch weather data from Open-Meteo for a specific location and date
export async function fetchWeatherData(
  latitude: number,
  longitude: number,
  date: Date,
): Promise<WeatherData | null> {
  try {
    const dateStr = date.toISOString().slice(0, 10)

    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      daily: 'temperature_2m_mean,relative_humidity_2m_mean,shortwave_radiation_sum,wind_speed_10m_max,cloud_cover_mean,precipitation_sum',
      timezone: 'auto',
      start_date: dateStr,
      end_date: dateStr,
    })

    const url = `${OPEN_METEO_URL}?${params}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    if (!response.ok) {
      console.error('Open-Meteo API error:', response.status)
      return null
    }

    const data = await response.json()

    if (!data.daily || !data.daily.time || data.daily.time.length === 0) {
      return null
    }

    return {
      temperatureC: data.daily.temperature_2m_mean?.[0] ?? 0,
      humidityPct: data.daily.relative_humidity_2m_mean?.[0] ?? 0,
      irradianceWm2: data.daily.shortwave_radiation_sum?.[0] ?? 0, // MJ/m²/day
      windSpeedMs: data.daily.wind_speed_10m_max?.[0] ?? 0,
      cloudCoverPct: data.daily.cloud_cover_mean?.[0] ?? 0,
      precipitationMm: data.daily.precipitation_sum?.[0] ?? 0,
    }
  } catch (error) {
    console.error('Weather fetch error:', error)
    return null
  }
}

// Store weather observation in database
export async function storeWeatherObservation(
  projectId: string,
  sourceId: string,
  observedAt: Date,
  data: WeatherData,
  dataSource: string = 'Open-Meteo',
) {
  try {
    return await db.weatherObservation.create({
      data: {
        projectId,
        sourceId,
        observedAt,
        temperatureC: data.temperatureC,
        humidityPct: data.humidityPct,
        irradianceWm2: data.irradianceWm2,
        windSpeedMs: data.windSpeedMs,
        cloudCoverPct: data.cloudCoverPct,
        precipitationMm: data.precipitationMm,
        dataSource,
      },
    })
  } catch (error) {
    // Unique constraint - observation already exists
    return null
  }
}

// Calculate Expected Yield using weather data
// Formula: Expected = Capacity(kWp) × POA Irradiation × (1 - losses) × inverter_efficiency
// POA (Plane of Array) irradiation from GHI (Global Horizontal Irradiance)
export async function calculateExpectedYield(
  projectId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{
  expectedEnergyKwh: number
  referenceYield: number
  performanceRatio: number
  weatherSource: string
  irradianceData: any[]
}> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      capacityKwp: true,
    },
  })

  if (!project || !project.latitude || !project.longitude || !project.capacityKwp) {
    return {
      expectedEnergyKwh: 0,
      referenceYield: 0,
      performanceRatio: 0,
      weatherSource: 'none',
      irradianceData: [],
    }
  }

  // Get or fetch weather observations for the period
  const days: Date[] = []
  const current = new Date(periodStart)
  while (current <= periodEnd) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  const irradianceData: any[] = []
  let totalIrradiance = 0 // MJ/m² total

  for (const day of days) {
    // Check if we already have weather data for this day
    let observation = await db.weatherObservation.findFirst({
      where: {
        projectId,
        observedAt: {
          gte: new Date(day.setHours(0, 0, 0, 0)),
          lt: new Date(day.setHours(23, 59, 59, 999)),
        },
      },
    })

    if (!observation) {
      // Fetch from Open-Meteo
      const weatherData = await fetchWeatherData(project.latitude, project.longitude, day)
      if (weatherData) {
        // Get or create weather source
        let source = await db.weatherSource.findFirst({
          where: { name: 'Open-Meteo' },
        })
        if (!source) {
          source = await db.weatherSource.create({
            data: {
              name: 'Open-Meteo',
              apiUrl: OPEN_METEO_URL,
              isActive: true,
            },
          })
        }

        observation = await storeWeatherObservation(
          project.id,
          source.id,
          day,
          weatherData,
        )
      }
    }

    if (observation) {
      // Convert MJ/m² to kWh/m² (1 MJ = 0.277778 kWh)
      const irradianceKwhM2 = (observation.irradianceWm2 || 0) * 0.277778
      totalIrradiance += irradianceKwhM2
      irradianceData.push({
        date: day.toISOString().slice(0, 10),
        irradianceMJ: observation.irradianceWm2,
        irradianceKwhM2: Math.round(irradianceKwhM2 * 100) / 100,
        temperatureC: observation.temperatureC,
        cloudCoverPct: observation.cloudCoverPct,
      })
    }
  }

  // System losses (typical for solar PV)
  const systemLosses = 0.14 // 14% (soiling, wiring, mismatch, etc.)
  const inverterEfficiency = 0.97
  const temperatureDerating = 0.95 // typical derating for hot climates

  // Reference Yield = POA irradiation / reference irradiance (1 kW/m²)
  const referenceYield = totalIrradiance // kWh/kWp equivalent

  // Expected Energy = Capacity × Reference Yield × (1 - losses) × inverter_eff × temp_derating
  const expectedEnergyKwh = project.capacityKwp * referenceYield * (1 - systemLosses) * inverterEfficiency * temperatureDerating

  // Get actual energy for PR calculation
  const actualReadings = await db.energyReading.findMany({
    where: {
      projectId,
      metricType: 'energy_export_kwh',
      measuredAt: { gte: periodStart, lte: periodEnd },
      qualityStatus: { in: ['validated', 'approved', 'corrected'] },
    },
    select: { value: true },
  })
  const actualEnergy = actualReadings.reduce((s, r) => s + r.value, 0)

  // Performance Ratio = Final Yield / Reference Yield
  // Final Yield = actualEnergy / capacity
  const finalYield = project.capacityKwp > 0 ? actualEnergy / project.capacityKwp : 0
  const performanceRatio = referenceYield > 0 ? (finalYield / referenceYield) * 100 : 0

  // Store expected yield model
  await db.expectedYieldModel.create({
    data: {
      projectId,
      modelType: 'deterministic',
      periodStart,
      periodEnd,
      expectedEnergyKwh: Math.round(expectedEnergyKwh),
      referenceYield: Math.round(referenceYield * 100) / 100,
      performanceRatio: Math.round(performanceRatio * 10) / 10,
      weatherSource: 'Open-Meteo',
      calculationMethod: 'Capacity × POA × (1-losses) × inverter × temp_derating',
      parameters: JSON.stringify({
        capacityKwp: project.capacityKwp,
        totalIrradiance: Math.round(totalIrradiance * 100) / 100,
        systemLosses,
        inverterEfficiency,
        temperatureDerating,
        actualEnergy: Math.round(actualEnergy),
        finalYield: Math.round(finalYield * 100) / 100,
      }),
    },
  })

  return {
    expectedEnergyKwh: Math.round(expectedEnergyKwh),
    referenceYield: Math.round(referenceYield * 100) / 100,
    performanceRatio: Math.round(performanceRatio * 10) / 10,
    weatherSource: 'Open-Meteo',
    irradianceData,
  }
}

// Calculate P50/P90 estimates based on historical weather variability
export async function calculateP50P90(
  projectId: string,
  capacityKwp: number,
  periodDays: number,
): Promise<{ p50: number; p90: number; p10: number; method: string }> {
  // Get historical weather observations for variability analysis
  const observations = await db.weatherObservation.findMany({
    where: { projectId },
    select: { irradianceWm2: true, observedAt: true },
    orderBy: { observedAt: 'asc' },
  })

  if (observations.length < 10) {
    // Not enough data for statistical analysis - use deterministic estimate
    const PSH = 5.5 // peak sun hours average
    const losses = 0.14
    const invEff = 0.97
    const p50 = capacityKwp * PSH * periodDays * (1 - losses) * invEff
    return {
      p50: Math.round(p50),
      p90: Math.round(p50 * 0.9), // 10% lower for P90
      p10: Math.round(p50 * 1.1), // 10% higher for P10
      method: 'deterministic_estimate (insufficient historical data)',
    }
  }

  // Calculate daily energy estimates from irradiance
  const dailyEnergies = observations.map((obs) => {
    const irradianceKwhM2 = (obs.irradianceWm2 || 0) * 0.277778
    return capacityKwp * irradianceKwhM2 * (1 - 0.14) * 0.97 * 0.95
  })

  // Sort for percentile calculation
  dailyEnergies.sort((a, b) => a - b)

  const p50Index = Math.floor(dailyEnergies.length * 0.5)
  const p90Index = Math.floor(dailyEnergies.length * 0.1) // 10th percentile (P90 = exceed with 90% probability)
  const p10Index = Math.floor(dailyEnergies.length * 0.9) // 90th percentile

  const avgDaily = dailyEnergies[p50Index] || 0
  const p90Daily = dailyEnergies[p90Index] || 0
  const p10Daily = dailyEnergies[p10Index] || 0

  return {
    p50: Math.round(avgDaily * periodDays),
    p90: Math.round(p90Daily * periodDays),
    p10: Math.round(p10Daily * periodDays),
    method: `statistical (${observations.length} historical observations)`,
  }
}
