'use client'

import { useEffect, useState } from 'react'
import { Sun, Thermometer, Droplets, Cloud, Wind, RefreshCw, AlertCircle } from 'lucide-react'

interface LiveWeatherData {
  observedAt: string
  temperatureC: number | null
  humidityPct: number | null
  windSpeedMs: number | null
  cloudCoverPct: number | null
  irradianceWm2: number | null
  isDay: boolean | null
  weatherCode: number | null
  source: 'Open-Meteo'
}

interface LiveWeatherResponse {
  projectId: string
  projectCode: string
  coordinates: { latitude: number; longitude: number }
  weather: LiveWeatherData
}

interface ProjectWeatherWidgetProps {
  projectId: string
  latitude?: number | null
  longitude?: number | null
}

/**
 * Live weather + solar irradiance for a single project, fetched by its own
 * coordinates via GET /api/projects/[id]/live-weather. Loads lazily on mount
 * (one call per card) rather than being fetched for the whole projects list
 * up front, since this is a live pass-through call to an external API.
 */
export function ProjectWeatherWidget({ projectId, latitude, longitude }: ProjectWeatherWidgetProps) {
  const [data, setData] = useState<LiveWeatherResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasCoordinates = latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null

  const load = async () => {
    if (!hasCoordinates) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/live-weather`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'تعذّر جلب بيانات الطقس')
        setData(null)
        return
      }
      setData(json)
    } catch {
      setError('تعذّر الاتصال بخدمة الطقس')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, latitude, longitude])

  if (!hasCoordinates) return null

  return (
    <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-[10px] text-sky-700 dark:text-sky-400 font-medium">
          <Sun className="h-3 w-3" />
          <span>الطقس والإشعاع الشمسي (مباشر)</span>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-sky-600 dark:text-sky-400 hover:opacity-70 disabled:opacity-40"
          title="تحديث"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !data && (
        <p className="text-[10px] text-muted-foreground">جارِ التحميل...</p>
      )}

      {error && !loading && (
        <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && !error && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex items-center gap-1">
            <Thermometer className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="tabular-nums">
              {data.weather.temperatureC !== null ? `${Math.round(data.weather.temperatureC)}°C` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Sun className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="tabular-nums">
              {data.weather.irradianceWm2 !== null ? `${Math.round(data.weather.irradianceWm2)} W/m²` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Droplets className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="tabular-nums">
              {data.weather.humidityPct !== null ? `${Math.round(data.weather.humidityPct)}%` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Cloud className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="tabular-nums">
              {data.weather.cloudCoverPct !== null ? `${Math.round(data.weather.cloudCoverPct)}%` : '—'}
            </span>
          </div>
          {data.weather.windSpeedMs !== null && (
            <div className="flex items-center gap-1 col-span-2">
              <Wind className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="tabular-nums">{data.weather.windSpeedMs.toFixed(1)} m/s</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
