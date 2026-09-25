const STALE_AFTER_MS = 6 * 60 * 60 * 1000

export type DeviceConnectivityState = 'connected' | 'stale' | 'offline'

export function getDeviceConnectivityState(
  status: string | null | undefined,
  lastSeenAt?: Date | string | null,
  now = Date.now(),
): DeviceConnectivityState {
  const normalizedStatus = (status || '').toLowerCase()
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0
  const isStale = lastSeenMs > 0 && now - lastSeenMs > STALE_AFTER_MS

  if (
    normalizedStatus === 'offline' ||
    normalizedStatus === 'disabled' ||
    normalizedStatus === 'decommissioned' ||
    normalizedStatus === 'maintenance'
  ) {
    return 'offline'
  }

  if (normalizedStatus === 'stale' || isStale) {
    return 'stale'
  }

  if (
    normalizedStatus === 'connected' ||
    normalizedStatus === 'registered' ||
    normalizedStatus === 'active' ||
    normalizedStatus === 'online'
  ) {
    return 'connected'
  }

  return 'connected'
}
