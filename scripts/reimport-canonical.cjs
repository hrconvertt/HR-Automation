/**
 * Canonical re-import.
 * Source of truth: "Convertt - Automated Employee Management.xlsx" (the 39-employee roster)
 * Enriched with: "Convertt_HR_FIXED.xlsx" (Employee_Master sheet) for status, email, CNIC, phone, etc.
 *
 * Run: node scripts/reimport-canonical.cjs
 */
const XLSX = require('xlsx')
const path = require('path')
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const CANONICAL_FILE = 'C:\\Users\\HRConvertt\\Downloads\\Convertt - Automated Employee Management.xlsx'
const HR_FIXED       = 'C:\\Users\\HRConvertt\\Documents\\HR-Automation-Playbook\\Convertt_HR_FIXED.xlsx'

// Canonical department names per user
const DEPT_NAMES = {
  HR:   'Human Resources',
  CTO:  'CTO Office',
  ADM:  'Admin',
  BD:   'Business Development',
  FIN:  'Finance',
  MDT:  'Media Team',
  MRK:  'Marketing',
  PCD:  'Project Coordinator',
  UIUX: 'UI/UX Design',
  WBS:  'Web - Shopify',
  WBW:  'Web - WordPress',
}

function excelDate(serial) {
  if (!serial || typeof serial !== 'number') return null
  return new Date(Math.floor(serial - 25569) * 86400 * 1000)
}

function parseDate(val) {
  if (val == null) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') return excelDate(val)
  if (typeof val === 'string') {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function mapStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s || s === 'active') return 'ACTIVE'
  if (s === 'terminated' || s === 'internship terminated') return 'TERMINATED'
  if (s === 'resigned' || s === 'internship completed') return 'RESIGNED'
  if (s === 'on leave') return 'ON_LEAVE'
  return 'ACTIVE'
}

function mapType(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'intern' || s === 'internship') return 'INTERNSHIP'
  if (s === 'trainee' || s === 'training') return 'TRAINING'
  if (s === 'probation') return 'PROBATION'
  return 'PERMANENT'
}

async function main() {
  console.log('🚀 Canonical Re-Import\n')

  // ─── 1. Read canonical roster ──────────────────────────────────────────────
  const wb1 = XLSX.readFile(CANONICAL_FILE)
  const rows1 = XLSX.utils.sheet_to_json(wb1.Sheets['Sheet1'], { header: 1 })
  const canonical = []
  for (let i = 2; i < rows1.length; i++) {
    const r = rows1[i]
    if (!r || !r[0] || !r[4]) continue
    const code = String(r[4]).trim()
    if (!code.startsWith('CON-')) continue
    canonical.push({
      name: String(r[0]).trim(),
      deptName: r[2] ? String(r[2]).trim() : null,
      deptCode: String(r[3]).trim(),
      code,
    })
  }
  console.log(`📋 Canonical roster: ${canonical.length} employees`)

  // ─── 2. Read HR FIXED for details ─────────────────────────────────────────
  const wb2 = XLSX.readFile(HR_FIXED)
  const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets['Employee_Master'], { header: 1 })
  const hrHeaders = rows2[0].map((h) => String(h || '').trim())
  const col = (n) => hrHeaders.findIndex((h) => h.toLowerCase().includes(n.toLowerCase()))

  const hrMap = new Map()
  for (let i = 1; i < rows2.length; i++) {
    const r = rows2[i]
    if (!r || !r[0]) continue
    const code = String(r[0]).trim()
    if (!code.startsWith('CON-')) continue
    hrMap.set(code, {
      joiningDate:  parseDate(r[col('Joining Date')]),
      designation:  r[col('Current Designation')]  ? String(r[col('Current Designation')]).trim() : '',
      employeeType: mapType(r[col('Employee Type')]),
      email:        r[col('Email')]                ? String(r[col('Email')]).trim().toLowerCase() : null,
      address:      r[col('Address')]              ? String(r[col('Address')]).trim() : null,
      cnic:         r[col('CNIC')] != null && String(r[col('CNIC')]).trim() !== '' ? String(r[col('CNIC')]).trim() : null,
      phone:        r[col('Phone')] != null && String(r[col('Phone')]).trim() !== '' ? String(r[col('Phone')]).trim() : null,
      dob:          parseDate(r[col('DOB')]),
      status:       mapStatus(r[col('Status')] || r[23]),
      exitDate:     parseDate(r[col('Termination Date')]),
      workLocation: r[col('Work Location')] ? String(r[col('Work Location')]).trim().toUpperCase().replace('-', '') : 'ONSITE',
      timings:      r[col('Timings - Standard Hours')] ? String(r[col('Timings - Standard Hours')]).trim() : '',
      reportingManagerName: r[col('Reporting Manager')] ? String(r[col('Reporting Manager')]).trim() : null,
      currentSalary: r[col('Current Salary')] != null ? Number(r[col('Current Salary')]) || 0 : 0,
    })
  }
  console.log(`📊 HR FIXED details: ${hrMap.size} rows indexed`)

  // ─── 3. Save current user (hr@convertt.co) so we can relink ──────────────
  const hrUser = await prisma.user.findUnique({ where: { email: 'hr@convertt.co' } })
  console.log(`👤 Preserving user: ${hrUser?.email}`)

  // ─── 4. Wipe employee-dependent tables ────────────────────────────────────
  console.log('\n🧹 Cleaning out old data...')
  await prisma.policyAcknowledgment.deleteMany({})
  await prisma.assetAssignment.deleteMany({})
  await prisma.employeeDocument.deleteMany({})
  await prisma.notification.deleteMany({})
  await prisma.compensationHistory.deleteMany({})
  await prisma.trainingRecord.deleteMany({})
  await prisma.showCause.deleteMany({})
  await prisma.pIP.deleteMany({})
  await prisma.jobOffer.deleteMany({})
  await prisma.auditLog.deleteMany({})
  await prisma.helpDeskTicket.deleteMany({})
  await prisma.performanceReview.deleteMany({})
  await prisma.probationRecord.deleteMany({})
  await prisma.onboardingChecklist.deleteMany({})
  await prisma.attendanceLog.deleteMany({})
  await prisma.leaveBalance.deleteMany({})
  await prisma.leaveRequest.deleteMany({})
  await prisma.payslip.deleteMany({})
  await prisma.payrollRun.deleteMany({})
  await prisma.salary.deleteMany({})
  await prisma.employee.deleteMany({})
  // Delete all users except hr@convertt.co
  await prisma.user.deleteMany({ where: { email: { not: 'hr@convertt.co' } } })
  console.log('  ✅ Cleared')

  // ─── 5. Ensure all departments exist ──────────────────────────────────────
  console.log('\n📁 Departments:')
  for (const [code, name] of Object.entries(DEPT_NAMES)) {
    await prisma.department.upsert({
      where: { code },
      create: { code, name },
      update: { name },
    })
    console.log(`  ✓ ${code.padEnd(6)} | ${name}`)
  }

  // ─── 6. Create employees from canonical roster ────────────────────────────
  console.log(`\n👥 Creating ${canonical.length} employees:`)
  const createdByName = new Map() // name → employee (for manager linking later)
  const createdByCode = new Map()
  const password = await bcrypt.hash('Convertt@2026', 12)

  for (const c of canonical) {
    const detail = hrMap.get(c.code) || {}
    const dept = await prisma.department.findUnique({ where: { code: c.deptCode } })
    if (!dept) {
      console.log(`  ⚠️  ${c.code} skipped — department ${c.deptCode} not found`)
      continue
    }

    // Determine email: prefer HR FIXED real email; only fallback if empty
    let email = detail.email
    if (!email || !email.includes('@')) {
      email = c.name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '') + '@convertt.co'
    }

    // Check uniqueness; if collision, append code suffix
    let finalEmail = email
    const existing = await prisma.employee.findUnique({ where: { email: finalEmail } }).catch(() => null)
    if (existing) {
      finalEmail = email.replace('@', `.${c.code.toLowerCase().replace('con-', '')}@`)
    }

    // Special handling: if email is hr@convertt.co, link to existing HR user
    let userId = null
    if (finalEmail === 'hr@convertt.co' && hrUser) {
      userId = hrUser.id
    } else {
      const newUser = await prisma.user.create({
        data: {
          email: finalEmail,
          password,
          role: 'EMPLOYEE',
          mustChangePass: true,
        },
      })
      userId = newUser.id
    }

    const employee = await prisma.employee.create({
      data: {
        employeeCode: c.code,
        userId,
        fullName: c.name,
        email: finalEmail,
        designation: detail.designation || c.deptName || 'Employee',
        hiringDesignation: detail.designation || null,
        departmentId: dept.id,
        employeeType: detail.employeeType || 'PERMANENT',
        status: detail.status || 'ACTIVE',
        joiningDate: detail.joiningDate || new Date('2025-01-01'),
        workLocation: ['ONSITE','WFH','HYBRID','REMOTE'].includes(detail.workLocation) ? detail.workLocation : 'ONSITE',
        timings: detail.timings || null,
        address: detail.address || null,
        cnic: detail.cnic || null,
        phone: detail.phone || null,
        dob: detail.dob || null,
        exitDate: detail.exitDate || null,
      },
    })

    createdByCode.set(c.code, employee)
    createdByName.set(c.name.toLowerCase(), employee)
    // also map first 2 words for fuzzy
    const short = c.name.split(' ').slice(0, 2).join(' ').toLowerCase()
    createdByName.set(short, employee)

    console.log(`  ✅ ${c.code.padEnd(15)} | ${c.deptCode.padEnd(5)} | ${c.name.padEnd(28)} | ${employee.status}`)
  }

  // ─── 7. Link reporting managers (by name) ─────────────────────────────────
  console.log('\n🔗 Linking reporting managers:')
  let linked = 0
  for (const c of canonical) {
    const detail = hrMap.get(c.code)
    if (!detail || !detail.reportingManagerName) continue
    const mgrName = detail.reportingManagerName.toLowerCase().trim()
    let manager = createdByName.get(mgrName)
    if (!manager) {
      // Try first-2-words fuzzy
      const short = mgrName.split(' ').slice(0, 2).join(' ')
      manager = createdByName.get(short)
    }
    if (manager) {
      const me = createdByCode.get(c.code)
      if (me && me.id !== manager.id) {
        await prisma.employee.update({
          where: { id: me.id },
          data: { reportingManagerId: manager.id },
        })
        // Also promote manager's user role
        if (manager.userId) {
          await prisma.user.update({ where: { id: manager.userId }, data: { role: 'MANAGER' } })
        }
        linked++
      }
    }
  }
  console.log(`  ✅ Linked ${linked} manager relationships`)

  // Make sure the HR user keeps HR_ADMIN role
  if (hrUser) {
    await prisma.user.update({ where: { id: hrUser.id }, data: { role: 'HR_ADMIN' } })
  }

  // ─── 8. Final report ──────────────────────────────────────────────────────
  const totalEmp = await prisma.employee.count()
  const byStatus = await prisma.employee.groupBy({ by: ['status'], _count: true })
  const byDept = await prisma.department.findMany({
    include: { _count: { select: { employees: true } } },
    orderBy: { code: 'asc' },
  })

  console.log(`\n🏁 Final state:`)
  console.log(`   Total employees: ${totalEmp}`)
  console.log(`   By status:`)
  byStatus.forEach((s) => console.log(`     ${s.status.padEnd(11)} : ${s._count}`))
  console.log(`   By department:`)
  byDept.forEach((d) => console.log(`     ${d.code.padEnd(5)} | ${d.name.padEnd(25)} | ${d._count.employees}`))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Import failed:', e)
  process.exit(1)
})
