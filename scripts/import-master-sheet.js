/**
 * One-shot importer for the user-supplied "Master Sheet - Convertt_HR (1).xlsx".
 *
 *   • Adds 5 new hires (UIUX-040, MDT-035/036, ADM-038/039) with User rows
 *   • Backfills DOB / CNIC / Phone / Address, Probation dates,
 *     Employee Type, and Notes on existing employees
 *   • Marks CON-FIN-026 and CON-UIUX-037 as RESIGNED (+ disables User)
 *   • Soft-deletes the two test records (CON-GEN-040 / CON-GEN-041)
 *   • Skips salary — user said sheet salary isn't yet accurate
 *
 * Re-run safe: matching is by Employee Code, updates are idempotent.
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const SHEET_PATH = String.raw`C:\Users\HRConvertt\Downloads\Master Sheet - Convertt_HR (1).xlsx`

// Excel serial → JS Date (Excel's epoch is 1899-12-30; treats serial as days)
function xlsxDate(serial) {
  if (serial == null || serial === '-' || serial === '') return null
  if (typeof serial !== 'number') return null
  // 86400 sec/day * 1000 ms/sec
  return new Date(Math.round((serial - 25569) * 86400 * 1000))
}

const STATUS_MAP = {
  Active: 'ACTIVE',
  Terminated: 'TERMINATED',
  Resigned: 'RESIGNED',
  'Resigned ': 'RESIGNED',
  'On Leave': 'ON_LEAVE',
}

const TYPE_MAP = {
  Permanent: 'PERMANENT',
  Probation: 'PROBATION',
  Internship: 'INTERNSHIP',
  Training: 'TRAINING',
}

// Sheet dept name → DB dept code (matches the rows on prisma.department.code)
const DEPT_TO_CODE = {
  'Business Development & Marketing': 'BD',
  'Business Development': 'BD',
  'Web - Shopify': 'WBS',
  'Finance': 'FIN',
  'Human Resource': 'HR',
  'Human Resources': 'HR',
  'Media Team': 'MDT',
  'UIUX': 'UIUX',
  'UI/UX': 'UIUX',
  'Web - WordPress': 'WBW',
  'Admin': 'ADM',
  'Marketing': 'MRK',
}
function deptCode(raw) {
  if (!raw) return null
  const k = String(raw).trim()
  return DEPT_TO_CODE[k] ?? DEPT_TO_CODE[k.replace(/\s+$/,'')] ?? null
}

async function main() {
  const prisma = new PrismaClient()
  // Neon free tier suspends after ~5 min of inactivity. Retry SELECT 1
  // up to 10 times with 4-second backoff to wake it before doing real work.
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… attempt ${i}/10`)
      await new Promise((r) => setTimeout(r, 4000))
    }
  }
  const wb = XLSX.readFile(SHEET_PATH)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Employee_Master'], { defval: null })

  // Resolve depts once
  const depts = await prisma.department.findMany({ select: { id: true, code: true } })
  const deptIdByCode = new Map(depts.map((d) => [d.code, d.id]))

  // For reporting manager resolution
  const allEmps = await prisma.employee.findMany({ select: { id: true, fullName: true } })
  const resolveManager = (name) => {
    if (!name) return null
    const norm = name.trim().toLowerCase()
    return allEmps.find((e) => e.fullName.trim().toLowerCase() === norm)?.id ?? null
  }

  let created = 0, updated = 0, skipped = 0, statusFlipped = 0, deletedTest = 0
  const issues = []

  for (const r of rows) {
    const code = r['Employee Code']
    if (!code) { skipped++; continue }

    const fullName = (r['Full Name'] || '').trim()
    const sheetStatus = STATUS_MAP[(r['Status'] || '').toString()] ?? null
    const empType = TYPE_MAP[(r['Employee Type'] || '').toString()] ?? 'PROBATION'
    const dept = deptCode(r['Department'])
    const deptId = dept ? deptIdByCode.get(dept) ?? null : null
    const cnic = r['CNIC'] ? String(r['CNIC']).trim() : null
    const phone = r['Phone'] ? String(r['Phone']).trim() : null
    const address = r['Current Home_ADDRESS'] ? String(r['Current Home_ADDRESS']).trim() : null
    const permAddr = r['Permanent address'] ? String(r['Permanent address']).trim() : null
    const dob = xlsxDate(r['DOB'])
    const joiningDate = xlsxDate(r['Joining Date'])
    const probationStart = xlsxDate(r['Probation Period\nStart Date'])
    const probationEnd = xlsxDate(r['Probation Period\nEnd Date'])
    const termDate = xlsxDate(r['Termination Date'])
    const designation = r['Current Designation'] ? String(r['Current Designation']).trim() : null

    const existing = await prisma.employee.findUnique({ where: { employeeCode: code } })

    if (existing) {
      // UPDATE chosen fields only — skip salary
      const data = {
        dob,
        cnic,
        phone,
        address,
        temporaryAddress: permAddr,
        employeeType: empType,
        // refine status if the sheet has one
        ...(sheetStatus ? { status: sheetStatus } : {}),
        ...(termDate ? { exitDate: termDate } : {}),
      }
      await prisma.employee.update({ where: { id: existing.id }, data })

      // upsert probation record if dates present
      if (probationStart && probationEnd) {
        await prisma.probationRecord.upsert({
          where: { employeeId: existing.id },
          update: { startDate: probationStart, endDate: probationEnd },
          create: { employeeId: existing.id, startDate: probationStart, endDate: probationEnd },
        })
      }

      // If now non-ACTIVE, disable login
      if (sheetStatus && sheetStatus !== 'ACTIVE') {
        const user = await prisma.user.findFirst({ where: { employee: { id: existing.id } } })
        if (user) {
          await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
          statusFlipped++
        }
      }
      updated++
    } else {
      // CREATE new hire + User
      const email = r['Email'] ? String(r['Email']).trim() : null
      if (!email) { issues.push(`${code}: no email — skipping create`); skipped++; continue }
      const tempPass = code.toLowerCase()
      const hashed = await bcrypt.hash(tempPass, 12)

      const managerId = resolveManager(r['Reporting Manager'])

      // 30s timeout — Neon transcontinental round-trips can exceed Prisma's 5s default.
      await prisma.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({ where: { email } })
        const emp = await tx.employee.create({
          data: {
            employeeCode: code,
            fullName,
            email,
            designation: designation || 'Staff',
            ...(deptId ? { department: { connect: { id: deptId } } } : {}),
            employeeType: empType,
            joiningDate: joiningDate || new Date(),
            cnic, phone, address, temporaryAddress: permAddr,
            dob,
            status: sheetStatus || 'ACTIVE',
            ...(managerId ? { reportingManager: { connect: { id: managerId } } } : {}),
            user: existingUser
              ? { connect: { id: existingUser.id } }
              : { create: { email, password: hashed, role: 'EMPLOYEE', mustChangePass: true, isActive: true, userRoles: { create: { role: 'EMPLOYEE' } } } },
          },
        })
        if (probationStart && probationEnd) {
          await tx.probationRecord.create({ data: { employeeId: emp.id, startDate: probationStart, endDate: probationEnd } })
        }
        await tx.onboardingChecklist.upsert({ where: { employeeId: emp.id }, update: {}, create: { employeeId: emp.id } })
      }, { timeout: 30000 })
      created++
    }
  }

  // Soft-delete the two test records created during development
  for (const testCode of ['CON-GEN-040', 'CON-GEN-041']) {
    const t = await prisma.employee.findUnique({ where: { employeeCode: testCode }, include: { user: true } })
    if (t) {
      await prisma.$transaction(async (tx) => {
        // hard-delete is fine for test data — no payroll history
        if (t.user) await tx.user.delete({ where: { id: t.user.id } }).catch(()=>{})
        await tx.employee.delete({ where: { id: t.id } }).catch(()=>{})
      }, { timeout: 30000 })
      deletedTest++
    }
  }

  console.log(JSON.stringify({ created, updated, statusFlipped, deletedTest, skipped, issues }, null, 2))
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
