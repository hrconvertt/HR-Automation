import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to perform this action' }, { status: 403 })
  }

  // Read all device-related config keys
  const configs = await prisma.config.findMany({
    where: { key: { startsWith: 'device_' } },
  })

  // Discover device serial numbers from config keys
  const snSet = new Set<string>()
  for (const c of configs) {
    const match = c.key.match(/^device_(.+?)_(lastSeen|lastSync)$/)
    if (match) snSet.add(match[1])
  }

  const cfgMap = Object.fromEntries(configs.map((c) => [c.key, c.value]))
  const syncToken = (await prisma.config.findUnique({ where: { key: 'deviceSyncToken' } }))?.value ?? ''
  const pinMap = (await prisma.config.findUnique({ where: { key: 'devicePinMap' } }))?.value ?? '{}'

  const devices = Array.from(snSet).map((sn) => ({
    sn,
    lastSeen: cfgMap[`device_${sn}_lastSeen`] ?? null,
    lastSync: cfgMap[`device_${sn}_lastSync`] ?? null,
  }))

  return NextResponse.json({ devices, syncToken, pinMap })
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'Switch back to HR view to perform this action' }, { status: 403 })
  }

  const body = await request.json()
  const { action } = body

  // Generate or update sync token
  if (action === 'regenerate_token') {
    const newToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    await prisma.config.upsert({
      where: { key: 'deviceSyncToken' },
      update: { value: newToken },
      create: { key: 'deviceSyncToken', value: newToken },
    })
    return NextResponse.json({ token: newToken })
  }

  // Save pin-to-employee mapping
  if (action === 'save_pin_map') {
    const { pinMap } = body
    await prisma.config.upsert({
      where: { key: 'devicePinMap' },
      update: { value: JSON.stringify(pinMap) },
      create: { key: 'devicePinMap', value: JSON.stringify(pinMap) },
    })
    return NextResponse.json({ ok: true })
  }

  // Remove a device from config
  if (action === 'remove_device') {
    const { sn } = body
    await prisma.config.deleteMany({
      where: { key: { in: [`device_${sn}_lastSeen`, `device_${sn}_lastSync`] } },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
