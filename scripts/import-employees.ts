/**
 * Import employees from Convertt Excel files into the HR database.
 * Run: npx ts-node scripts/import-employees.ts
 */

import XLSX from 'xlsx'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const EXCEL_DIR = 'C:\\Users\\HRConvertt\\Documents\\HR-Automation-Playbook'

function excelDateToJS(serial: number): Date {
  const utc_days = Math.floor(serial - 25569)
  const utc_value = utc_days * 86400
  return new Date(utc_value * 1000)
}

function parseDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') return excelDateToJS(val)
  if (typeof val === 'string') {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function inferDeptCode(code: string): string {
  const match = code.match(/CON-([A-Z]+)-/)
  return match ? match[1] : 'MISC'
}

async function ensureDepartment(code: string): Promise<string> {
  const deptNames: Record<string, string> = {
    BD: 'Business Development & Marketing',
    CTO: 'CTO Office',
    FIN: 'Finance',
    HR: 'Human Resources',
    MDT: 'Media & Technology',
    UIUX: 'UI/UX Design',
    WBS: 'Web & Software (Backend)',
    WBW: 'Web & Software (WordPress)',
    MISC: 'Miscellaneous',
  }
  const name = deptNames[code] || code
  const dept = await prisma.department.upsert({
    where: { code },
    create: { code, name },
    update: {},
  })
  return dept.id
}

async function importEmployeeMaster() {
  console.log('\n📂 Reading Employee Master...')
  const wb = XLSX.readFile(path.join(EXCEL_DIR, 'Convertt_HR_FIXED.xlsx'))
  const ws = wb.Sheets['Employee_Master']
  if (!ws) { console.log('❌ Employee_Master sheet not found'); return }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  // Find header row
  let headerRow = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] as unknown[]
    if (row && row.some(c => typeof c === 'string' && (c as string).includes('Employee Code'))) {
      headerRow = i
      break
    }
  }
  if (headerRow === -1) { console.log('❌ Header row not found'); return }

  const headers = (rows[headerRow] as string[]).map(h => String(h || '').trim())
  const col = (name: string) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()))

  const codeIdx = col('Employee Code')
  const nameIdx = col('Full Name')
  const joiningIdx = col('Joining Date')
  const designationIdx = col('Current Designation')
  const deptIdx = col('Department')
  const managerIdx = col('Reporting Manager')
  const locationIdx = col('Work Location')
  const timingsIdx = col('Timings')

  let created = 0, skipped = 0

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !row[codeIdx]) continue

    const code = String(row[codeIdx]).trim()
    if (!code.startsWith('CON-')) continue

    const fullName = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : ''
    if (!fullName) continue

    const joiningDate = joiningIdx >= 0 ? parseDate(row[joiningIdx]) : null
    const designation = designationIdx >= 0 ? String(row[designationIdx] || '').trim() : 'Employee'
    const deptCode = inferDeptCode(code)
    const workLocation = locationIdx >= 0 ? String(row[locationIdx] || 'ONSITE').trim().toUpperCase() : 'ONSITE'
    const timings = timingsIdx >= 0 ? String(row[timingsIdx] || '').trim() : ''

    // Generate email from name
    const emailBase = fullName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '')
    const email = `${emailBase}@convertt.co`

    const deptId = await ensureDepartment(deptCode)

    // Determine employee type from code pattern & designation
    let employeeType = 'PERMANENT'
    const lowerDes = designation.toLowerCase()
    if (lowerDes.includes('intern')) employeeType = 'INTERNSHIP'
    else if (lowerDes.includes('trainee')) employeeType = 'TRAINING'

    try {
      const existing = await prisma.employee.findUnique({ where: { employeeCode: code } })
      if (existing) { skipped++; continue }

      // Create user account
      const passwordHash = await bcrypt.hash('Convertt@2026', 12)
      const role = deptCode === 'HR' ? 'HR_ADMIN' : 'EMPLOYEE'

      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          role,
          mustChangePass: true,
        },
      })

      await prisma.employee.create({
        data: {
          employeeCode: code,
          userId: user.id,
          fullName,
          email,
          joiningDate: joiningDate || new Date(),
          designation,
          hiringDesignation: designation,
          departmentId: deptId,
          employeeType,
          status: 'ACTIVE',
          workLocation: ['ONSITE', 'WFH', 'HYBRID'].includes(workLocation) ? workLocation : 'ONSITE',
          timings,
        },
      })

      created++
      console.log(`  ✅ ${code} — ${fullName}`)
    } catch (err) {
      console.log(`  ⚠️  ${code} — ${fullName}: ${(err as Error).message}`)
      skipped++
    }
  }

  console.log(`\n  Created: ${created}, Skipped: ${skipped}`)
}

async function importSalaries() {
  console.log('\n💰 Importing salaries from Payroll Master...')
  const wb = XLSX.readFile(path.join(EXCEL_DIR, 'Payroll_Master_FIXED.xlsx'))

  let imported = 0

  for (const sheetName of wb.SheetNames) {
    if (['Payroll Sheet', 'Sheet4'].includes(sheetName)) continue

    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

    let basic = 0, houseRent = 0, utilities = 0, food = 0, fuel = 0
    let employeeCode = ''

    for (const row of rows as unknown[][]) {
      if (!row) continue
      const r = row as unknown[]
      // Find employee code
      const codeCell = r.find(c => typeof c === 'string' && (c as string).startsWith('CON-'))
      if (codeCell) employeeCode = String(codeCell)

      // Find salary components by scanning for known labels
      for (let i = 0; i < r.length - 1; i++) {
        const label = String(r[i] || '').toLowerCase().trim()
        const val = Number(r[i + 1]) || 0
        if (label.includes('basic salary')) basic = val
        else if (label.includes('house rent')) houseRent = val
        else if (label.includes('utilities')) utilities = val
        else if (label.includes('food')) food = val
        else if (label.includes('fuel')) fuel = val
      }
    }

    if (!employeeCode || !basic) continue

    const employee = await prisma.employee.findUnique({ where: { employeeCode } })
    if (!employee) continue

    await prisma.salary.upsert({
      where: { employeeId: employee.id },
      create: {
        employeeId: employee.id,
        basic,
        houseRent,
        utilities,
        food,
        fuel,
        effectiveFrom: new Date('2025-11-01'),
      },
      update: { basic, houseRent, utilities, food, fuel },
    })

    imported++
    console.log(`  ✅ ${employeeCode} — PKR ${basic.toLocaleString()}`)
  }

  console.log(`\n  Imported: ${imported} salary records`)
}

async function importLeaveBalances() {
  console.log('\n🏖️  Importing leave balances...')
  const wb = XLSX.readFile(path.join(EXCEL_DIR, 'Attendance_Leave_Tracking_FIXED.xlsx'))
  const ws = wb.Sheets['Leave Tracker']
  if (!ws) { console.log('❌ Leave Tracker sheet not found'); return }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]

  let headerRow = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i] as unknown[]
    if (row && row.some(c => typeof c === 'string' && (c as string).includes('Employee ID'))) {
      headerRow = i; break
    }
  }
  if (headerRow === -1) return

  const headers = (rows[headerRow] as string[]).map(h => String(h || '').trim())
  const col = (n: string) => headers.findIndex(h => h.toLowerCase().includes(n.toLowerCase()))

  const empCodeIdx = col('Employee ID')
  const clIdx = col('Casual')
  const slIdx = col('Sick')
  const elIdx = col('Earned')

  let imported = 0
  const processed = new Set<string>()

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || !row[empCodeIdx]) continue

    const code = String(row[empCodeIdx]).trim()
    if (!code.startsWith('CON-') || processed.has(code)) continue
    processed.add(code)

    const employee = await prisma.employee.findUnique({ where: { employeeCode: code } })
    if (!employee) continue

    const clUsed = clIdx >= 0 ? Number(row[clIdx]) || 0 : 0
    const slUsed = slIdx >= 0 ? Number(row[slIdx]) || 0 : 0
    const elUsed = elIdx >= 0 ? Number(row[elIdx]) || 0 : 0

    const leaveTypes = [
      { type: 'CASUAL', allocated: 12, used: clUsed },
      { type: 'SICK', allocated: 10, used: slUsed },
      { type: 'EARNED', allocated: 14, used: elUsed },
    ]

    for (const { type, allocated, used } of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_year_leaveType: { employeeId: employee.id, year: 2026, leaveType: type } },
        create: { employeeId: employee.id, year: 2026, leaveType: type, allocated, used, remaining: allocated - used },
        update: { used, remaining: allocated - used },
      })
    }

    imported++
  }

  console.log(`  Imported leave balances for ${imported} employees`)
}

async function createManagerLinks() {
  console.log('\n🔗 Linking reporting managers...')
  const wb = XLSX.readFile(path.join(EXCEL_DIR, 'Convertt_HR_FIXED.xlsx'))
  const ws = wb.Sheets['Employee_Master']
  if (!ws) return

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
  let headerRow = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] as unknown[]
    if (row?.some(c => typeof c === 'string' && (c as string).includes('Employee Code'))) {
      headerRow = i; break
    }
  }
  if (headerRow === -1) return

  const headers = (rows[headerRow] as string[]).map(h => String(h || '').trim())
  const codeIdx = headers.findIndex(h => h.includes('Employee Code'))
  const managerIdx = headers.findIndex(h => h.includes('Reporting Manager'))

  if (managerIdx === -1) return

  let linked = 0
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row?.[codeIdx]) continue
    const code = String(row[codeIdx]).trim()
    const managerName = String(row[managerIdx] || '').trim()
    if (!code.startsWith('CON-') || !managerName) continue

    const employee = await prisma.employee.findUnique({ where: { employeeCode: code } })
    const manager = await prisma.employee.findFirst({ where: { fullName: { contains: managerName } } })

    if (employee && manager && employee.id !== manager.id) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { reportingManagerId: manager.id },
      })
      linked++
    }
  }
  console.log(`  Linked ${linked} manager relationships`)
}

async function main() {
  console.log('🚀 Convertt HR — Data Import Script')
  console.log('=====================================')

  try {
    await importEmployeeMaster()
    await importSalaries()
    await importLeaveBalances()
    await createManagerLinks()

    const total = await prisma.employee.count()
    console.log(`\n✅ Import complete. Total employees in DB: ${total}`)
  } catch (err) {
    console.error('❌ Import failed:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
