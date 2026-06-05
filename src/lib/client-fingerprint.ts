/**
 * Lightweight, stable device fingerprint for clock-in trust scoring.
 *
 * NOT a privacy-defeating supercookie — just a hash of stable browser
 * characteristics that's good enough to recognise "same laptop next morning."
 *
 * Stored in localStorage so the user clears it if they want; we also send
 * the freshly computed hash so HR can match across reinstalls.
 */

export type ClientContext = {
  deviceHash?: string
  userAgent?: string
  lat?: number
  lng?: number
  ssid?: string
}

const STORAGE_KEY = 'hr_device_hash_v1'

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.textBaseline = 'top'
    ctx.font = "14px 'Arial'"
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('Convertt-HR', 2, 15)
    ctx.fillStyle = 'rgba(102,204,0,0.7)'
    ctx.fillText('Convertt-HR', 4, 17)
    return canvas.toDataURL()
  } catch {
    return ''
  }
}

export async function getDeviceHash(): Promise<string> {
  const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  if (cached) return cached

  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasFingerprint().slice(0, 200),
  ]
  const hash = await sha256(parts.join('|'))
  try {
    localStorage.setItem(STORAGE_KEY, hash)
  } catch {
    /* ignore */
  }
  return hash
}

export function getGeolocation(timeoutMs = 3000): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({})
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({})
      }
    }, timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({})
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    )
  })
}

/**
 * Collect everything the server needs to score this clock-in.
 * Browsers can't read WiFi SSID for privacy reasons, so we leave it
 * blank (the server treats SSID match as optional). Mobile apps would
 * inject it via a wrapper.
 */
export async function getClientContext(): Promise<ClientContext> {
  const [deviceHash, geo] = await Promise.all([getDeviceHash(), getGeolocation()])
  return {
    deviceHash,
    userAgent: navigator.userAgent,
    lat: geo.lat,
    lng: geo.lng,
  }
}
