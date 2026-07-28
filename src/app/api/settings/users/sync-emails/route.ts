/**
 * POST /api/settings/users/sync-emails
 *
 * HR-only one-click bulk email sync. Same logic as
 * scripts/sync-employee-emails.cjs but runs server-side so HR
 * doesn't need PowerShell + DATABASE_URL.
 *
 * Reads the canonical roster (inlined below), fuzzy-matches each row
 * to an existing Employee by name, updates Employee.email + User.email,
 * clears User.clerkUserId so stale Clerk links break. Idempotent.
 */

import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Canonical list — HR's source of truth.
const ROSTER: { name: string; email: string }[] = [
  { name: 'Syed Asghar',              email: 'syed@convertt.co' },
  { name: 'Iqra Naveed',              email: 'accounts@convertt.co' },
  { name: 'Muhammad Waqas Fareed',    email: 'waqas@convertt.co' },
  { name: 'Tahreem Waheed',           email: 'hr@convertt.co' },
  { name: 'Sheikh Taha Adnan',        email: 'sheeikhtahag9t@gmail.com' },
  { name: 'Usman Ali',                email: 'usmanch7744@gmail.com' },
  { name: 'Tayyab Hussain',           email: 'tayyabhussainjutt146@gmail.com' },
  { name: 'Abdullah Shafiq',          email: 'abdullah@convertt.co' },
  { name: 'Zuhaa Jutt',               email: 'zuhaajutt345@gmail.com' },
  { name: 'Muhammad Usman Saeed',     email: 'usmansaeedsaeed658@gmail.com' },
  { name: 'Ali Hassan',               email: 'ahalihassanmalik@gmail.com' },
  { name: 'Umar Ameen',               email: 'umarameen0320@gmail.com' },
  { name: 'Altaf Yaseen',             email: 'snophysharp@gmail.com' },
  { name: 'Muhammad Ammar Younas',    email: 'ammar.softeng@gmail.com' },
  { name: 'Atta Ur Rehman',           email: 'support@convertt.co' },
  { name: 'Muzaffar Jamil',           email: 'muzaffarjamil11@gmail.com' },
  { name: 'Muhammad Ahsan',           email: 'chahsanikhlaq@gmail.com' },
  { name: 'Momna Waryam Khan',        email: 'momnafatima021@gmail.com' },
  { name: 'Muhammad Rayyan',          email: 'mrrayyan200@gmail.com' },
  { name: 'Muhammad Irfan',           email: 'official.irfanjanjua@gmail.com' },
  { name: 'Aqib Aslam',               email: 'aqibaslam100@gmail.com' },
  { name: 'Ali Shan',                 email: 'alishansadaqatali@gmail.com' },
  { name: 'Muhammad Salman Shahid',   email: 'salmanuix@gmail.com' },
  { name: 'Arslan',                   email: 'arsalanshah2002lhr@gmail.com' },
  { name: 'Muhammad Farzeen Khan',    email: 'shazibfarzeen@icloud.com' },
  { name: 'Huzaifa Hakeem',           email: 'ranahuzaifa666@gmail.com' },
  { name: 'Muhammad Hashir',          email: 'hashir@convertt.co' },
]

const HONORIFICS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'sir', 'madam',
  'syed', 'sheikh', 'shaikh', 'muhammad', 'mohammad', 'mohd', 'md',
  'hafiz', 'qari', 'engr', 'dr', 'prof',
])

function tokens(name: string): string[] {
  if (!name) return []
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t))
}

function fuzzyMatch<T extends { fullName: string }>(query: string, employees: T[]): T | null {
  const qTokens = tokens(query)
  if (qTokens.length === 0) return null
  const qSet = new Set(qTokens)
  let best: T | null = null
  let bestScore = 0
  for (const e of employees) {
    const eTokens = tokens(e.fullName)
    const eSet = new Set(eTokens)
    let overlap = 0
    for (const t of qSet) if (eSet.has(t)) overlap++
    if (overlap === 0) continue
    const exact = e.fullName.toLowerCase().includes(query.trim().toLowerCase())
    const score = overlap * 10 + (exact ? 5 : 0) - Math.abs(eTokens.length - qTokens.length)
    if (score > bestScore) { bestScore = score; best = e }
  }
  if (qTokens.length === 1 && bestScore < 10) return null
  if (qTokens.length >= 2 && bestScore < 20) return null
  return best
}

export async function POST() {
  const payload = await verifyToken()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (payload.role !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'HR only' }, { status: 403 })
  }

  const employees = await prisma.employee.findMany({
    select: { id: true, fullName: true, email: true, userId: true },
  })

  const log: string[] = []
  let updated = 0, unchanged = 0
  const unmatched: string[] = []
  const conflicts: { name: string; email: string; conflict: string }[] = []

  for (const row of ROSTER) {
    const match = fuzzyMatch(row.name, employees)
    if (!match) {
      unmatched.push(row.name)
      log.push(`[unmatched] ${row.name} → ${row.email}`)
      continue
    }
    const desired = row.email.toLowerCase().trim()
    const current = (match.email || '').toLowerCase().trim()
    if (current === desired) {
      unchanged++
      log.push(`[unchanged] ${match.fullName}: ${desired}`)
      continue
    }
    // Conflict check.
    const conflictEmp = await prisma.employee.findFirst({
      where: { email: desired, NOT: { id: match.id } },
      select: { fullName: true },
    })
    const conflictUser = await prisma.user.findFirst({
      where: { email: desired, NOT: { id: match.userId ?? '__none__' } },
      select: { email: true },
    })
    if (conflictEmp || conflictUser) {
      const conflict = conflictEmp?.fullName ?? conflictUser?.email ?? 'unknown'
      conflicts.push({ name: row.name, email: desired, conflict })
      log.push(`[conflict] ${match.fullName} → ${desired} (already used by ${conflict})`)
      continue
    }
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: match.id }, data: { email: desired } })
      if (match.userId) {
        await tx.user.update({
          where: { id: match.userId },
          data: { email: desired, clerkUserId: null },
        })
      }
    })
    log.push(`[updated]   ${match.fullName}: ${current || '<none>'} → ${desired}`)
    updated++
  }

  return NextResponse.json({
    ok: true,
    summary: { updated, unchanged, unmatched, conflicts },
    log,
  })
}
