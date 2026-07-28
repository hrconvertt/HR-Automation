/**
 * Fix employee data: correct statuses, fill in missing fields (email, CNIC, phone, DOB),
 * and recalculate leave balances by summing all months from the leave tracker.
 * Run: npx ts-node --project tsconfig.json scripts/fix-employee-data.ts
 */

import XLSX from 'xlsx'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EXCEL_DIR = 'C:\\Users\\HRConvertt\\Documents\\HR-Automation-Playbook'

function excelDateToJS(serial: number): Date {
  const utc_days = Math.floor(serial - 25569)
  return new Date(utc_days * 86400 * 1000)
}

function parseDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number' && val > 1000) return excelDateToJS(val)
  if (typeof val === 'string') {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function mapStatus(raw: string): string {
  const s = raw.trim().toLowerCase()
  if (s === 'terminated' || s === 'internship terminated') return 'TERMINATED'
  if (s === 'resigned' || s === 'internship completed') return 'RESIGNED'
  if (s === 'on leave') return 'ON_LEAVE'
  return 'ACTIVE'
}

function mapEmployeeType(raw: string): string {
  const s = raw.trim().toLowerCase()
  if (s === 'intern' || s === 'internship') return 'INTERNSHIP'
  if (s === 'trainee' || s === 'training') return 'TRAINING'
  if (s === 'probation') return 'PROBATION'
  return 'PERMANENT'
}

async function fixEmployeeFields() {
  console.log('\n📋 Fixing employee fields from Employee_Master...')
  const wb = XLSX.readFile(path.join(EXCEL_DIR, 'Convertt_HR_FIXED.xlsx'))
  const ws = wb.Sheets['Employee_Master']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  let hdr = -1
  for (let i = 0; i < 10; i++) {
    if (rows[i]?.some((c) => String(c || '').includes('Employee Code'))) { hdr = i; break }
  }
  if (hdr === -1) { console.log('❌ Header not found'); return }

  const headers = (rows[hdr] as string[]).map((h) => String(h || '').trim())
  const col = (n: string) => headers.findIndex((h) => h.toLowerCase().includes(n.toLowerCase()))
  const colExact = (n: string) => headers.findIndex((h) => h === n)

  const codeIdx    = col('Employee Code')
  const statusIdx  = colExact('Status')
  const typeIdx    = col('Employee Type')
  const emailIdx   = col('Email')
  const cnicIdx    = colExact('CNIC')
  const phoneIdx   = colExact('Phone')
  const dobIdx     = colExact('DOB')
  const termIdx    = col('Termination Date')
  const resignIdx  = col('Resignation Start Date')
  const genderIdx  = col('Gender')

  let updated = 0, skipped = 0

  for (let i = hdr + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !row[codeIdx]) continue
    const code = String(row[codeIdx]).trim()
    if (!code.startsWith('CON-')) continue

    const employee = await prisma.employee.findUnique({ where: { employeeCode: code } })
    if (!employee) { skipped++; continue }

    const rawStatus = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : ''
    const rawType   = typeIdx >= 0 ? String(row[typeIdx] || '').trim() : ''
    const rawEmail  = emailIdx >= 0 ? String(row[emailIdx] || '').trim() : ''
    const rawCnic   = cnicIdx >= 0 ? String(row[cnicIdx] || '').trim() : ''
    const rawPhone  = phoneIdx >= 0 ? String(row[phoneIdx] || '').trim() : ''
    const rawDob    = dobIdx >= 0 ? row[dobIdx] : null
    const rawTerm   = termIdx >= 0 ? row[termIdx] : null
    const rawResign = resignIdx >= 0 ? row[resignIdx] : null

    const newStatus = rawStatus ? mapStatus(rawStatus) : employee.status
    const newType   = rawType ? mapEmployeeType(rawType) : employee.employeeType
    const dob       = parseDate(rawDob)
    const exitDate  = parseDate(rawTerm) ?? parseDate(rawResign) ?? employee.exitDate

    // Check if real email is usable (not already taken by someone else)
    let emailToUse = employee.email
    if (rawEmail && rawEmail.includes('@') && rawEmail.toLowerCase() !== employee.email) {
      const conflict = await prisma.employee.findFirst({
        where: { email: rawEmail.toLowerCase(), NOT: { id: employee.id } }
      })
      if (!conflict) emailToUse = rawEmail.toLowerCase()
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        status: newStatus,
        employeeType: newType,
        email: emailToUse,
        cnic: rawCnic || employee.cnic,
        phone: rawPhone || employee.phone,
        dob: dob ?? employee.dob,
        exitDate: exitDate ?? undefined,
      },
    }).catch(async () => {
      // Fallback: update without email in case of race condition conflict
      await prisma.employee.update({
        where: { id: employee.id },
        data: {
          status: newStatus,
          employeeType: newType,
          cnic: rawCnic || employee.cnic,
          phone: rawPhone || employee.phone,
          dob: dob ?? employee.dob,
          exitDate: exitDate ?? undefined,
        },
      })
    })

    const statusChanged = newStatus !== employee.status
    const typeChanged   = newType !== employee.employeeType
    if (statusChanged || typeChanged) {
      console.log(`  ✅ ${code} — status: ${employee.status}→${newStatus}  type: ${employee.employeeType}→${newType}`)
    }
    updated++
  }

  console.log(`  Updated: ${updated}, Skipped: ${skipped}`)
}

async function fixLeaveBalances() {
  console.log('\n🏖️  Recalculating leave balances from full leave history...')
  const wb = XLSX.readFile(path.join(EXCEL_DIR, 'Attendance_Leave_Tracking_FIXED.xlsx'))
  const ws = wb.Sheets['Leave Tracker']
  if (!ws) { console.log('❌ Leave Tracker sheet not found'); return }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  let hdr = -1
  for (let i = 0; i < 8; i++) {
    if (rows[i]?.some((c) => String(c || '').includes('Employee'))) { hdr = i; break }
  }
  if (hdr === -1) return

  const headers = (rows[hdr] as string[]).map((h) => String(h || '').trim())
  const col = (n: string) => headers.findIndex((h) => h.toLowerCase().includes(n.toLowerCase()))

  const codeIdx   = col('Employee ID')
  const clIdx     = col('Casual')
  const slIdx     = col('Sick')
  const elIdx     = col('Earned')

  // Sum leave usage per employee across ALL months
  const totals: Record<string, { cl: number; sl: number; el: number }> = {}

  for (let i = hdr + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !row[codeIdx]) continue
    const code = String(row[codeIdx]).trim()
    if (!code.startsWith('CON-')) continue

    if (!totals[code]) totals[code] = { cl: 0, sl: 0, el: 0 }
    totals[code].cl += clIdx >= 0 ? Number(row[clIdx]) || 0 : 0
    totals[code].sl += slIdx >= 0 ? Number(row[slIdx]) || 0 : 0
    totals[code].el += elIdx >= 0 ? Number(row[elIdx]) || 0 : 0
  }

  let fixed = 0
  for (const [code, used] of Object.entries(totals)) {
    const employee = await prisma.employee.findUnique({ where: { employeeCode: code } })
    if (!employee) continue

    const leaveTypes = [
      { type: 'CASUAL', allocated: 12, used: used.cl },
      { type: 'SICK',   allocated: 10, used: used.sl },
      { type: 'EARNED', allocated: 14, used: used.el },
    ]

    for (const { type, allocated, used: usedDays } of leaveTypes) {
      const safeUsed = Math.min(usedDays, allocated)
      await prisma.leaveBalance.upsert({
        where: { employeeId_year_leaveType: { employeeId: employee.id, year: 2026, leaveType: type } },
        create: { employeeId: employee.id, year: 2026, leaveType: type, allocated, used: safeUsed, remaining: allocated - safeUsed },
        update: { used: safeUsed, remaining: allocated - safeUsed },
      })
    }
    fixed++
  }

  console.log(`  Recalculated leave balances for ${fixed} employees`)
}

async function main() {
  console.log('🔧 Convertt HR — Data Fix Script')
  console.log('==================================')
  try {
    await fixEmployeeFields()
    await fixLeaveBalances()
    console.log('\n✅ Fix complete.')
  } catch (err) {
    console.error('❌ Fix failed:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
