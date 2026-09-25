import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAccess } from '@/lib/authorization'
import { calculateExpectedYield, calculateP50P90, fetchWeatherData, storeWeatherObservation } from '@/lib/weather'
import { db } from '@/lib/db'

// GET /api/weather?projectId=xxx&action=fetch|expected|p50p90
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const action = searchParams.get('action') || 'list'

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const auth = await requireProjectAccess(projectId, 'project:read')
    if (!auth.authorized) return auth.response

    if (action === 'list') {
      // List weather observations
      const observations = await db.weatherObservation.findMany({
        where: { projectId },
        orderBy: { observedAt: 'desc' },
        take: 30,
      })
      return NextResponse.json({ observations })
    }

    if (action === 'fetch') {
      // Fetch fresh weather data from Open-Meteo
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { latitude: true, longitude: true },
      })

      if (!project?.latitude || !project?.longitude) {
        return NextResponse.json({ error: 'Project location not set' }, { status: 400 })
      }

      const today = new Date()
      const weatherData = await fetchWeatherData(project.latitude, project.longitude, today)

      if (!weatherData) {
        return NextResponse.json({ error: 'Failed to fetch weather data' }, { status: 502 })
      }

      // Store observation
      let source = await db.weatherSource.findFirst({ where: { name: 'Open-Meteo' } })
      if (!source) {
        source = await db.weatherSource.create({
          data: { name: 'Open-Meteo', apiUrl: 'https://api.open-meteo.com/v1/forecast', isActive: true },
        })
      }

      await storeWeatherObservation(projectId, source.id, today, weatherData, 'Open-Meteo')

      return NextResponse.json({ success: true, data: weatherData, source: 'Open-Meteo' })
    }

    if (action === 'expected') {
      // Calculate expected yield using weather data
      const periodStart = new Date(searchParams.get('periodStart') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      const periodEnd = new Date(searchParams.get('periodEnd') || new Date())

      const result = await calculateExpectedYield(projectId, periodStart, periodEnd)

      return NextResponse.json({
        success: true,
        ...result,
      })
    }

    if (action === 'p50p90') {
      // Calculate P50/P90 estimates
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { capacityKwp: true },
      })

      if (!project?.capacityKwp) {
        return NextResponse.json({ error: 'Project capacity not set' }, { status: 400 })
      }

      const periodDays = parseInt(searchParams.get('days') || '365')
      const result = await calculateP50P90(projectId, project.capacityKwp, periodDays)

      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Weather API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
