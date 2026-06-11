/**
 * scripts/export-credentials.js
 * ─────────────────────────────
 * Standalone script — reads all User+Employee rows from DB and writes a
 * `credentials-export.csv` file in the project root. HR distributes the
 * temp password to each employee on first hand-off; users are required
 * to change it on first login (mustChangePass=true forces redirect).
 *
 * Columns:
 *   Employee Code | Legacy Code | Full Name | Email | Designation
 *   Department | Role | Temp Password | Must Change Password | Status
 *
 * Run locally with DATABASE_URL set:
 *   node scripts/export-credentials.js
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const TEMP_PASSWORD = 'Convertt2026!'

function csvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

async function main() {
  const prisma = new PrismaClient()
  for (let i = 1; i <= 10; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break }
    catch (e) {
      if (i === 10) throw e
      console.log(`Waking Neon… attempt ${i}/10`)
      await new Promise((r) => setTimeout(r, 4000))
    }
  }

  const users = await prisma.user.findMany({
    include: {
      employee: {
        select: {
          employeeCode: true,
          legacyEmployeeCode: true,
          fullName: true,
          designation: true,
          department: { select: { code: true, name: true } },
          status: true,
        },
      },
      userRoles: { select: { role: true } },
    },
    orderBy: { email: 'asc' },
  })

  const header = [
    'Employee Code', 'Legacy Code', 'Full Name', 'Email',
    'Designation', 'Department', 'Role', 'Temp Password',
    'Must Change Password', 'Status',
  ]
  const lines = [header.join(',')]

  for (const u of users) {
    const emp = u.employee
    const roles = u.userRoles.length > 0
      ? u.userRoles.map((r) => r.role).join('+')
      : u.role
    const tempPass = u.mustChangePass ? TEMP_PASSWORD : '<user-changed>'
    lines.push([
      csvCell(emp?.employeeCode ?? ''),
      csvCell(emp?.legacyEmployeeCode ?? ''),
      csvCell(emp?.fullName ?? ''),
      csvCell(u.email),
      csvCell(emp?.designation ?? ''),
      csvCell(emp?.department?.name ?? ''),
      csvCell(roles),
      csvCell(tempPass),
      csvCell(u.mustChangePass ? 'true' : 'false'),
      csvCell(emp?.status ?? (u.isActive ? 'ACTIVE' : 'DISABLED')),
    ].join(','))
  }

  const outPath = path.join(process.cwd(), 'credentials-export.csv')
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`Wrote ${users.length} credentials to ${outPath}`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
