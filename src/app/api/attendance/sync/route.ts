/**
 * Universal Attendance Device Sync Endpoint
 *
 * Supports:
 *  1. ZKTeco ADMS push protocol  (GET handshake + POST text/plain punches)
 *  2. JSON webhook                (any device/middleware posting JSON)
 *  3. CSV text body               (devices that POST comma-separated lines)
 *
 * Employee mapping:
 *  Devices enrol employees using their CON-XXX-NNN code (without "CON-" prefix is also fine).
 *  e.g. enrol as "WBS-015" or "CON-WBS-015" — both resolve correctly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPayrollConfig } from '@/lib/config'

// ─── helpers ──────────────────────────────────────────────────────────────────

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseTimestamp(raw: unknown): Date | null {
  if (!raw) return null
  if (raw instanceof Date) return raw
  const s = String(raw).trim()
  // "YYYY-MM-DD HH:MM:SS" (ZKTeco)
  const m1 = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/)
  if (m1) return new Date(`${m1[1]}T${m1[2]}`)
  // ISO or any parseable
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** Resolve employee from a device badge/pin — accepts CON-XXX-NNN or XXX-NNN or numeric ID */
async function resolveEmployee(pin: string) {
  const normalized = pin.trim()

  // Try exact employee code
  let emp = await prisma.employee.findUnique({ where: { employeeCode: normalized } })
  if (emp) return emp

  // Try with CON- prefix
  if (!normalized.startsWith('CON-')) {
    emp = await prisma.employee.findUnique({ where: { employeeCode: `CON-${normalized}` } })
    if (emp) return emp
  }

  // Try numeric mapping from Config (devicePinMap: { "001": "CON-WBS-015" })
  const mapCfg = await prisma.config.findUnique({ where: { key: 'devicePinMap' } })
  if (mapCfg) {
    const map = JSON.parse(mapCfg.value) as Record<string, string>
    const mapped = map[normalized]
    if (mapped) {
      emp = await prisma.employee.findUnique({ where: { employeeCode: mapped } })
      if (emp) return emp
    }
  }

  return null
}

/** Core punch processing — called by all format handlers */
async function processPunch(
  pin: string,
  timestamp: Date,
  punchType: 'IN' | 'OUT' | 'AUTO', // AUTO = figure out from context
  workType: string = 'ONSITE',
  source: string = 'DEVICE',
) {
  const employee = await resolveEmployee(pin)
  if (!employee) return { ok: false, reason: `Unknown pin: ${pin}` }

  const logDate = dayStart(timestamp)
  const cfg = await getPayrollConfig()

  const existing = await prisma.attendanceLog.findFirst({
    where: { employeeId: employee.id, date: logDate },
  })

  // ── Clock IN ──────────────────────────────────────────────────────────────
  const shouldClockIn =
    punchType === 'IN' ||
    (punchType === 'AUTO' && !existing)

  if (shouldClockIn && !existing) {
    const isLate =
      timestamp.getHours() > cfg.lateThresholdHour ||
      (timestamp.getHours() === cfg.lateThresholdHour && timestamp.getMinutes() > cfg.lateThresholdMinute)
    const lateMinutes = isLate
      ? (timestamp.getHours() - cfg.lateThresholdHour) * 60 + (timestamp.getMinutes() - cfg.lateThresholdMinute)
      : 0

    await prisma.attendanceLog.create({
      data: {
        employeeId: employee.id,
        date: logDate,
        clockIn: timestamp,
        status: isLate ? 'LATE' : 'PRESENT',
        lateMinutes,
        workType,
        notes: `Synced from ${source}`,
      },
    })
    return { ok: true, action: 'CLOCK_IN', employee: employee.employeeCode }
  }

  // ── Clock OUT ─────────────────────────────────────────────────────────────
  const shouldClockOut =
    punchType === 'OUT' ||
    (punchType === 'AUTO' && existing && !existing.clockOut && timestamp > (existing.clockIn ?? timestamp))

  if (shouldClockOut && existing && existing.clockIn) {
    // Ignore duplicate punches within 1 minute of clock-in
    const minutesSinceIn = (timestamp.getTime() - existing.clockIn.getTime()) / 60000
    if (minutesSinceIn < 1) return { ok: true, action: 'IGNORED_DUPLICATE' }

    const hoursWorked = (timestamp.getTime() - existing.clockIn.getTime()) / 3600000
    const rawOT = Math.max(0, hoursWorked - cfg.standardHoursPerDay)
    const overtimeHours = Math.round(rawOT * 2) / 2

    await prisma.attendanceLog.update({
      where: { id: existing.id },
      data: {
        clockOut: timestamp,
        hoursWorked: Math.round(hoursWorked * 100) / 100,
        overtimeHours,
        notes: `Synced from ${source}`,
      },
    })
    return { ok: true, action: 'CLOCK_OUT', employee: employee.employeeCode, hoursWorked }
  }

  return { ok: true, action: 'SKIPPED', reason: 'No action needed' }
}

// ─── ZKTeco ADMS Handshake (GET) ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sn = searchParams.get('SN') || 'UNKNOWN'
  const options = searchParams.get('options')

  // Log device last-seen
  await prisma.config.upsert({
    where: { key: `device_${sn}_lastSeen` },
    update: { value: new Date().toISOString() },
    create: { key: `device_${sn}_lastSeen`, value: new Date().toISOString() },
  }).catch(() => {})

  if (options === 'all') {
    // ZKTeco initial handshake — return device configuration
    const body = [
      `GET OPTION FROM: ${sn}`,
      'ATTLOGStamp=9999',
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=9999',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog OpLog',
      'TimeZone=5',
      'Realtime=1',
      'Encrypt=None',
    ].join('\r\n')
    return new NextResponse(body, {
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse('OK', { headers: { 'Content-Type': 'text/plain' } })
}

// ─── POST handler — auto-detects format ──────────────────────────────────────

export async function POST(request: NextRequest) {
  // Check device token if configured
  const globalToken = await prisma.config.findUnique({ where: { key: 'deviceSyncToken' } })
  if (globalToken?.value) {
    const provided =
      request.headers.get('x-device-token') ||
      new URL(request.url).searchParams.get('token')
    if (provided !== globalToken.value) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }

  const { searchParams } = new URL(request.url)
  const sn = searchParams.get('SN') || 'WEB'
  const table = searchParams.get('table') || ''
  const contentType = request.headers.get('content-type') || ''

  // ── 1. ZKTeco ADMS punch log ──────────────────────────────────────────────
  if (table === 'ATTLOG' || table === 'attlog') {
    const body = await request.text()
    const results: unknown[] = []

    for (const line of body.split('\n')) {
      const parts = line.trim().split('\t')
      if (parts.length < 2) continue

      const pin = parts[0]
      const timestamp = parseTimestamp(parts[1])
      if (!pin || !timestamp) continue

      // ZKTeco status: 0=check-in, 1=check-out, 4=OT-in, 5=OT-out, 255=unknown
      const zkStatus = parseInt(parts[2] ?? '255', 10)
      const punchType: 'IN' | 'OUT' | 'AUTO' =
        zkStatus === 0 || zkStatus === 4 ? 'IN' :
        zkStatus === 1 || zkStatus === 5 ? 'OUT' : 'AUTO'

      const result = await processPunch(pin, timestamp, punchType, 'ONSITE', `ZKTeco-${sn}`)
      results.push(result)
    }

    // Update device last sync
    await prisma.config.upsert({
      where: { key: `device_${sn}_lastSync` },
      update: { value: new Date().toISOString() },
      create: { key: `device_${sn}_lastSync`, value: new Date().toISOString() },
    }).catch(() => {})

    return new NextResponse('OK', { headers: { 'Content-Type': 'text/plain' } })
  }

  // ── 2. JSON webhook ───────────────────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await request.json()

    // Support both single punch and array
    const punches = Array.isArray(body) ? body : [body]
    const results = []

    for (const punch of punches) {
      // Normalize field names across different vendors
      const pin =
        punch.pin ?? punch.badge_id ?? punch.employee_id ?? punch.employeeCode ??
        punch.user_id ?? punch.card_no ?? punch.id ?? ''
      const rawTime =
        punch.time ?? punch.timestamp ?? punch.punch_time ?? punch.datetime ??
        punch.check_time ?? punch.record_time ?? ''
      const rawType =
        punch.type ?? punch.punch_type ?? punch.status ?? punch.event_type ?? 'AUTO'

      const timestamp = parseTimestamp(rawTime)
      if (!pin || !timestamp) {
        results.push({ ok: false, reason: 'Missing pin or timestamp' })
        continue
      }

      const punchType: 'IN' | 'OUT' | 'AUTO' =
        String(rawType).toLowerCase().includes('out') || rawType === '1' || rawType === 1 ? 'OUT' :
        String(rawType).toLowerCase().includes('in') || rawType === '0' || rawType === 0 ? 'IN' : 'AUTO'

      const workType = punch.work_type ?? punch.workType ?? 'ONSITE'
      const result = await processPunch(pin, timestamp, punchType, workType, `JSON-${sn}`)
      results.push(result)
    }

    return NextResponse.json({ processed: results.length, results })
  }

  // ── 3. CSV text body ──────────────────────────────────────────────────────
  if (contentType.includes('text/plain') || contentType.includes('text/csv')) {
    const body = await request.text()
    const results = []

    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      // Expected: pin,YYYY-MM-DD HH:MM:SS[,IN|OUT]
      const parts = trimmed.split(',')
      if (parts.length < 2) continue

      const pin = parts[0].trim()
      const timestamp = parseTimestamp(parts[1].trim())
      if (!pin || !timestamp) continue

      const rawType = parts[2]?.trim() ?? 'AUTO'
      const punchType: 'IN' | 'OUT' | 'AUTO' =
        rawType.toUpperCase() === 'OUT' ? 'OUT' :
        rawType.toUpperCase() === 'IN' ? 'IN' : 'AUTO'

      const result = await processPunch(pin, timestamp, punchType, 'ONSITE', `CSV-${sn}`)
      results.push(result)
    }

    return NextResponse.json({ processed: results.length, results })
  }

  return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
}
