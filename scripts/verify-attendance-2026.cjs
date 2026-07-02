/* eslint-disable */
const fs = require('fs')
const path = require('path')
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (m) {
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  })
}
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
const CODES = ['CON-WBS-005','CON-WBS-004','CON-WBS-003','CON-WBS-008','CON-MDT-001','CON-HR-001','CON-MDT-003','CON-UIUX-006','CON-MDT-002','CON-UIUX-004','CON-UIUX-003']
;(async () => {
  const emps = await p.employee.findMany({ where: { employeeCode: { in: CODES } }, select: { id: true, employeeCode: true, fullName: true } })
  for (const e of emps) {
    const rows = await p.attendanceLog.findMany({
      where: { employeeId: e.id, date: { gte: new Date(Date.UTC(2026,0,1)), lte: new Date(Date.UTC(2026,6,2)) } },
      select: { date: true, status: true },
    })
    const byStatus = {}
    let weekendNonWE = 0
    for (const r of rows) {
      const d = new Date(r.date)
      const dow = d.getUTCDay()
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
      if ((dow === 0 || dow === 6) && r.status !== 'WEEKEND') weekendNonWE++
    }
    console.log(`${e.fullName} (${e.employeeCode}) total=${rows.length} weekendNonWE=${weekendNonWE}`, byStatus)
  }
  await p.$disconnect()
})()
