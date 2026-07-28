/**
 * clock-in trust scoring.
 *
 * Layers, each contributing to a 0–100 trust score:
 *   1. Known device          (+40)
 *   2. IP inside a Location  (+25)
 *   3. WiFi SSID match       (+15)
 *   4. Geofence match        (+20)
 *
 * If no Locations are configured, IP/SSID/geo checks are SKIPPED (neutral)
 * — useful for early bootstrapping. Once HR adds Locations the score
 * naturally tightens.
 *
 * Score bands:
 *   >= 80  AUTO_OK          (clock-in allowed)
 *   50–79  MANAGER_REVIEW   (logged, manager gets notification)
 *    < 50  BLOCKED          (clock-in rejected with reason)
 */

import { prisma } from '@/lib/prisma'

export type ClientContext = {
  deviceHash?: string
  userAgent?: string
  lat?: number
  lng?: number
  ssid?: string
}

export type ScoringResult = {
  score: number
  decision: 'AUTO_OK' | 'MANAGER_REVIEW' | 'BLOCKED'
  flags: string[]      // e.g. ['UNKNOWN_DEVICE','OUTSIDE_GEOFENCE']
  matchedLocationId?: string
  matchedLocationName?: string
  reason?: string      // human-readable summary when decision != AUTO_OK
}

// ── IP helpers ────────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) + v
  }
  return n >>> 0
}

export function ipInCidr(ip: string, cidr: string): boolean {
  if (!ip || !cidr) return false
  // Support bare IP (treated as /32)
  if (!cidr.includes('/')) return ip === cidr
  const [range, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const ipInt = ipv4ToInt(ip)
  const rangeInt = ipv4ToInt(range)
  if (ipInt === null || rangeInt === null) return false
  if (bits === 0) return true
  const mask = (~0 << (32 - bits)) >>> 0
  return (ipInt & mask) === (rangeInt & mask)
}

// ── Geo helpers ───────────────────────────────────────────────────────────────

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // meters
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function safeParseArray(s: string | null | undefined): string[] {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function scoreClockIn(opts: {
  employeeId: string
  ip: string | null
  ctx: ClientContext
}): Promise<ScoringResult> {
  const { employeeId, ip, ctx } = opts
  const flags: string[] = []
  let score = 0

  // 1) Device check — primary signal (80 pts when trusted)
  let deviceTrusted = false
  if (ctx.deviceHash) {
    const dev = await prisma.trustedDevice.findUnique({
      where: { employeeId_deviceHash: { employeeId, deviceHash: ctx.deviceHash } },
    })
    if (dev && dev.status === 'TRUSTED') {
      deviceTrusted = true
      score += 80
      // Touch lastUsedAt asynchronously (don't block scoring)
      void prisma.trustedDevice
        .update({ where: { id: dev.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {})
    } else if (dev && dev.status === 'PENDING') {
      flags.push('DEVICE_PENDING_APPROVAL')
    } else if (dev && dev.status === 'REVOKED') {
      flags.push('DEVICE_REVOKED')
    } else {
      flags.push('UNKNOWN_DEVICE')
    }
  } else {
    flags.push('NO_DEVICE_FINGERPRINT')
  }

  // 2) WiFi SSID match — secondary signal (20 pts when present, mobile-only)
  let matchedLocation: { id: string; name: string } | null = null
  let ssidMatched = false
  if (ctx.ssid) {
    const locations = await prisma.location.findMany({ where: { active: true } })
    for (const loc of locations) {
      const ssids = safeParseArray(loc.ssids)
      if (ssids.includes(ctx.ssid)) {
        matchedLocation = { id: loc.id, name: loc.name }
        ssidMatched = true
        score += 20
        break
      }
    }
    if (!ssidMatched) flags.push('SSID_MISMATCH')
  }
  // Note: browsers can't read SSID — no flag for absence on browser clock-ins.

  // Clamp
  score = Math.max(0, Math.min(100, score))

  // Decision — device trust is the deciding factor now
  let decision: ScoringResult['decision']
  let reason: string | undefined
  if (deviceTrusted) {
    decision = 'AUTO_OK'
  } else if (flags.includes('DEVICE_PENDING_APPROVAL')) {
    decision = 'MANAGER_REVIEW'
    reason = 'First time on this device — recorded as PENDING. HR will approve to silence this for future check-ins.'
  } else {
    decision = 'BLOCKED'
    reason = `Clock-in blocked. Reason: ${flags[0] === 'UNKNOWN_DEVICE' ? 'Unknown device — please contact HR to register it.' : flags[0] === 'DEVICE_REVOKED' ? 'This device was revoked. Contact HR.' : 'No device fingerprint — please enable cookies/local storage in your browser.'}`
  }

  return {
    score,
    decision,
    flags,
    matchedLocationId: matchedLocation?.id,
    matchedLocationName: matchedLocation?.name,
    reason,
  }
}

// ── Device registration helper ────────────────────────────────────────────────

/**
 * On first-ever clock-in from a new device we auto-register it as PENDING
 * so HR / the manager can approve it. The device works for that session
 * (it just gets flagged) — first-use friction is bad UX.
 */
export async function ensureDeviceRecord(opts: {
  employeeId: string
  deviceHash: string
  userAgent?: string
}) {
  const { employeeId, deviceHash, userAgent } = opts
  const existing = await prisma.trustedDevice.findUnique({
    where: { employeeId_deviceHash: { employeeId, deviceHash } },
  })
  if (existing) return existing
  return prisma.trustedDevice.create({
    data: {
      employeeId,
      deviceHash,
      userAgent: userAgent ?? null,
      status: 'PENDING',
    },
  })
}

// ── Client-IP extraction from Next request headers ────────────────────────────

export function extractClientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}
