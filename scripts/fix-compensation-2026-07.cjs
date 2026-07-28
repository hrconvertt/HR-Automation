/**
 * fix-compensation-2026-07.cjs
 *
 * HR-approved compensation data cleanup (July 2026). Local script — DO NOT COMMIT runs.
 *
 *   A. Delete the bogus 2026-06-22 "Probation confirmation salary increase"
 *      CompensationHistory cluster (Iqra, Taha, Muzaffar, Momna WBS-005).
 *      The same-dated bogus Salary rows (incl. Ahsan's 50k) are corrected in D —
 *      Salary is unique per employee, so deleting would drop them from payroll.
 *   B. Reclassify one-off rows (OT / bonus / commission / arrears / payouts →
 *      BONUS; deductions & churn → ADJUSTMENT) so they stop reading as baselines.
 *   C. Ali Hassan (CON-UIUX-005) ledger cleanup: delete the two rows that belong
 *      to Muhammad Hassan (CON-WBW-002 already has identical copies — moving
 *      would duplicate), and the orphan INITIAL 0→58k dated 2026-06-11.
 *   D. Baseline corrections: insert type=REGULAR CompensationHistory rows where
 *      the latest history row ≠ HR target, and align the Salary table (which is
 *      what src/app/api/payroll/generate/route.ts actually reads — gross = sum
 *      of the 7 Salary components) with every target. Creates missing Salary
 *      rows for Aqib Aslam and Muhammad Waqas Fareed.
 *
 * Every touched row is printed BEFORE → AFTER. All writes run in one
 * transaction (120s timeout for Neon). A final verification table re-resolves
 * each employee the way the payroll generator does and asserts target match.
 *
 * Run: node scripts/fix-compensation-2026-07.cjs
 */
const path = require('path')
const ROOT = path.join(__dirname, '..')
require(path.join(ROOT, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env.local') })
require(path.join(ROOT, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const NOTE = 'Baseline correction per HR compensation sheet 2026-07'
const fmt = (n) => Math.round(n).toLocaleString('en-PK')
const d = (s) => new Date(`${s}T00:00:00.000Z`)

// ─── A. Bogus 2026-06-22 probation cluster — CompensationHistory deletes ─────
// Matched precisely by id, re-verified at runtime by employee/newSalary/reason.
const DELETE_PROBATION = [
  { id: 'cmqp9me7t0002d5cimb3wjofb', who: 'Iqra Naveed', newSalary: 251700 },
  { id: 'cmqpa3nap000110jjet0pnlun', who: 'Sheikh Taha Adnan', newSalary: 130000 },
  { id: 'cmqp9ogpy0001127fkfagdjyd', who: 'Muzaffar Jamil', newSalary: 130000 },
  { id: 'cmqpa7oye0001j693u1f9k7ud', who: 'Momna Waryam Khan', newSalary: 235000 },
]

// ─── B. One-off rows to reclassify (id, expected snapshot, new type) ─────────
const RECLASSIFY = [
  // Usman Saeed
  { id: 'cmq9b8bhx008pwznwxy8fepvz', who: 'Usman Saeed', newSalary: 117500, to: 'BONUS' },   // Apr OT 7,500 (already BONUS → no-op)
  { id: 'cmq9b8byo008rwznwq0y86vof', who: 'Usman Saeed', newSalary: 118991, to: 'BONUS' },   // May OT 8,991
  // Ali Hassan (CON-UIUX-005)
  { id: 'cmq98j5wu00ab14nxsde2x640', who: 'Ali Hassan', newSalary: 65500, to: 'BONUS' },      // Apr OT 2,500
  { id: 'cmq98j6a900ad14nxc23hsnep', who: 'Ali Hassan', newSalary: 67100, to: 'BONUS' },      // May OT 4,100
  { id: 'cmq9hbaem0004k86zd9y669d7', who: 'Ali Hassan', newSalary: 70000, to: 'ADJUSTMENT' }, // May churn (already ADJUSTMENT)
  { id: 'cmq9hcst90009k86zau3fws50', who: 'Ali Hassan', newSalary: 65500, to: 'ADJUSTMENT' }, // May churn 70k→65.5k
  // Umar Ameen
  {
    id: 'cmq98j3pi009z14nxta93y7qk', who: 'Umar Ameen', newSalary: 54000, to: 'ADJUSTMENT',   // Mar sandwich deduction
    notes: 'Sandwich leave deduction — subsequently paid back; 6,000 returned via leave payout in May',
  },
  { id: 'cmq98j42s00a114nxuy2cblud', who: 'Umar Ameen', newSalary: 62500, to: 'BONUS' },      // Apr OT 2,500
  { id: 'cmq98j4g200a314nxmkockizc', who: 'Umar Ameen', newSalary: 66858, to: 'BONUS' },      // May leave payout + OT
  // Ammar
  { id: 'cmq9b8lwx0099wznw6fxy2c5k', who: 'Muhammad Ammar Younas', newSalary: 74104, to: 'BONUS' }, // May OT 1,104
  // Altaf Yaseen
  { id: 'cmq98j7s500al14nxdwf6je4m', who: 'Altaf Yaseen', newSalary: 135000, to: 'BONUS' },   // Mar 10k bonus (already BONUS → no-op)
  { id: 'cmq98j8p200ap14nxk29ck5k6', who: 'Altaf Yaseen', newSalary: 127000, to: 'BONUS' },   // May OT 2,000
  // Iqra Naveed — commissions
  { id: 'cmqp8ezal0007k4wnjhxp8jth', who: 'Iqra Naveed', newSalary: 241650, to: 'BONUS' },    // Mar commission
  { id: 'cmq98j2ky009t14nx7sopniw8', who: 'Iqra Naveed', newSalary: 210850, to: 'BONUS' },    // May commission
  // Taha Adnan
  { id: 'cmq9b8mb5009bwznw8uzbhza4', who: 'Sheikh Taha Adnan', newSalary: 50000, to: 'ADJUSTMENT' }, // Mar sandwich deduction (reverted Apr)
  // Tayyab Hussain
  { id: 'cmq98j71900ah14nxo0042p0o', who: 'Tayyab Hussain', newSalary: 56000, to: 'BONUS' },  // Apr 48k + 8k arrears
]

// ─── C. Ali Hassan ledger cleanup — deletes ──────────────────────────────────
// The two Muhammad Hassan rows already exist verbatim on CON-WBW-002
// (cmq98j92800ar14nxzuhm9owh, cmq98j9fn00at14nxwwqnqjhf) — moving would
// duplicate, so we delete Ali Hassan's copies. The INITIAL 0→58k dated
// 2026-06-11 is an orphan created during a data-fix session (he was employed
// since 2025 and at 65,500 gross by June 2026) — delete.
const DELETE_ALI_HASSAN = [
  { id: 'cmq9b8jmm0091wznwxon95k45', who: 'Ali Hassan', newSalary: 50000, why: "Muhammad Hassan's row (WBW-002 already has an identical copy)" },
  { id: 'cmq9b8k3k0093wznwn358etjx', who: 'Ali Hassan', newSalary: 35484, why: "Muhammad Hassan's row (WBW-002 already has an identical copy)" },
  { id: 'cmq9h86xk00047pj6ntr1qnkj', who: 'Ali Hassan', newSalary: 58000, why: 'orphan INITIAL 0→58k dated 2026-06-11' },
]

// ─── D. HR target baselines ──────────────────────────────────────────────────
// forceInsert = HR-confirmed NEW comp events with their own effective dates.
// Everyone else gets a REGULAR correction row @ 2026-07-01 only if the latest
// (post-cleanup) history row's newSalary ≠ target. Salary table is aligned for
// ALL (that's what the payroll generator actually reads).
const TARGETS = [
  { code: 'CON-WBS-002', name: 'Atta Ur Rehman', target: 195000 },
  { code: 'CON-WBS-004', name: 'Muhammad Ahsan', target: 100000, forceInsert: '2026-06-01' },
  { code: 'CON-UIUX-004', name: 'Muhammad Usman Saeed', target: 110000 },
  { code: 'CON-WBS-005', name: 'Momna Waryam Khan', target: 160000, forceInsert: '2026-05-01' },
  { code: 'CON-WBS-010', name: 'Ali Shan', target: 72000 },
  { code: 'CON-BD-007', name: 'Iqra Naveed', target: 140850 },
  { code: 'CON-MDT-002', name: 'Usman Ali', target: 50000 },
  { code: 'CON-ADM-001', name: 'Arslan', target: 45000, forceInsert: '2025-10-01' },
  { code: 'CON-UIUX-006', name: 'Umar Ameen', target: 60000 },
  { code: 'CON-WBS-003', name: 'Muzaffar Jamil', target: 83000 },
  { code: 'CON-WBW-001', name: 'Aqib Aslam', target: 120000 },
  { code: 'CON-UIUX-005', name: 'Ali Hassan', target: 63000 },
  { code: 'CON-UIUX-002', name: 'Abdullah Shafiq', target: 170000 },
  { code: 'CON-MDT-003', name: 'Tayyab Hussain', target: 48000 },
  { code: 'CON-UIUX-009', name: 'Altaf Yaseen', target: 125000 },
  { code: 'CON-WBS-008', name: 'Muhammad Rayyan', target: 50000 },
  { code: 'CON-UIUX-010', name: 'Muhammad Ammar Younas', target: 73000 },
  { code: 'CON-MDT-001', name: 'Sheikh Taha Adnan', target: 65000 },
  { code: 'CON-CTO-002', name: 'Muhammad Waqas Fareed', target: 120400 },
  { code: 'CON-HR-001', name: 'Tahreem Waheed', target: 100000, forceInsert: '2026-06-01' },
  { code: 'CON-WBS-009', name: 'Muhammad Irfan', target: 55000 },
  { code: 'CON-ADM-003', name: 'Jamshed', target: 45000 },
  { code: 'CON-UIUX-003', name: 'Zuhaa Jutt', target: 55000 },
  { code: 'CON-MRK-001', name: 'Muhammad Hashir Siddiqui', target: 70000 }, // RESIGNED — historical, still verified
]

const SALARY_FIELDS = ['basic', 'houseRent', 'utilities', 'food', 'fuel', 'medicalAllowance', 'otherAllowance']
const grossOf = (s) => SALARY_FIELDS.reduce((sum, f) => sum + (s[f] ?? 0), 0)

/** Scale an existing Salary breakdown to a new gross (keeps the employee's
 *  component structure; rounding remainder lands in basic). No existing row →
 *  Convertt's common 60/30/10 split. */
function scaleBreakdown(existing, targetGross) {
  if (!existing || grossOf(existing) <= 0) {
    const basic = Math.round(targetGross * 0.6)
    const houseRent = Math.round(targetGross * 0.3)
    return { basic, houseRent, utilities: 0, food: 0, fuel: 0, medicalAllowance: 0, otherAllowance: targetGross - basic - houseRent }
  }
  const ratio = targetGross / grossOf(existing)
  const out = {}
  for (const f of SALARY_FIELDS) out[f] = Math.round((existing[f] ?? 0) * ratio)
  out.basic += targetGross - grossOf(out) // absorb rounding drift
  return out
}

async function main() {
  console.log('══ Compensation fix per HR sheet 2026-07 ══\n')
  const counts = { deletedA: 0, reclassifiedB: 0, deletedC: 0, insertedD: 0, salaryAlignedD: 0, salaryCreatedD: 0 }

  // Resolve employees up front (outside txn) and hard-verify codes.
  const emps = await prisma.employee.findMany({
    where: { employeeCode: { in: TARGETS.map((t) => t.code) } },
    select: { id: true, fullName: true, employeeCode: true, status: true },
  })
  const byCode = Object.fromEntries(emps.map((e) => [e.employeeCode, e]))
  for (const t of TARGETS) {
    if (!byCode[t.code]) throw new Error(`Employee not found: ${t.code} (${t.name})`)
  }

  await prisma.$transaction(async (tx) => {
    // ── A. Delete probation cluster ─────────────────────────────────────────
    console.log('── A. Delete bogus 2026-06-22 probation cluster ──')
    for (const del of DELETE_PROBATION) {
      const row = await tx.compensationHistory.findUnique({ where: { id: del.id }, include: { employee: { select: { fullName: true } } } })
      if (!row) throw new Error(`A: row ${del.id} (${del.who}) not found — aborting`)
      if (row.newSalary !== del.newSalary || !/probation confirmation/i.test(row.reason ?? '') || row.effectiveDate.toISOString().slice(0, 10) !== '2026-06-22') {
        throw new Error(`A: row ${del.id} does not match expected snapshot (${del.who} →${del.newSalary}) — aborting`)
      }
      await tx.compensationHistory.delete({ where: { id: del.id } })
      counts.deletedA++
      console.log(`  DELETE ${row.employee.fullName}: [${row.type} ${fmt(row.oldSalary)}→${fmt(row.newSalary)} eff 2026-06-22 "${row.reason}"] → (removed)`)
    }
    console.log('  (Same-dated bogus Salary rows — incl. Muhammad Ahsan gross 50,000 — are overwritten with HR targets in step D;')
    console.log('   Salary is one-row-per-employee, so deleting would drop them from payroll entirely.)\n')

    // ── B. Reclassify one-offs ──────────────────────────────────────────────
    console.log('── B. Reclassify one-off rows (OT/bonus/commission → BONUS, deductions/churn → ADJUSTMENT) ──')
    for (const rc of RECLASSIFY) {
      const row = await tx.compensationHistory.findUnique({ where: { id: rc.id }, include: { employee: { select: { fullName: true } } } })
      if (!row) throw new Error(`B: row ${rc.id} (${rc.who}) not found — aborting`)
      if (row.newSalary !== rc.newSalary) throw new Error(`B: row ${rc.id} snapshot mismatch (expected →${rc.newSalary}, got →${row.newSalary}) — aborting`)
      const eff = row.effectiveDate.toISOString().slice(0, 10)
      if (row.type === rc.to && !rc.notes) {
        console.log(`  SKIP   ${row.employee.fullName} eff ${eff} →${fmt(row.newSalary)}: already ${rc.to}`)
        continue
      }
      await tx.compensationHistory.update({ where: { id: rc.id }, data: { type: rc.to, ...(rc.notes ? { notes: rc.notes } : {}) } })
      counts.reclassifiedB++
      console.log(`  UPDATE ${row.employee.fullName} eff ${eff} →${fmt(row.newSalary)}: type ${row.type} → ${rc.to}${rc.notes ? ` | notes: null → "${rc.notes}"` : ''}`)
    }
    console.log()

    // ── C. Ali Hassan ledger cleanup ────────────────────────────────────────
    console.log('── C. Ali Hassan (CON-UIUX-005) ledger cleanup ──')
    for (const del of DELETE_ALI_HASSAN) {
      const row = await tx.compensationHistory.findUnique({ where: { id: del.id }, include: { employee: { select: { fullName: true, employeeCode: true } } } })
      if (!row) throw new Error(`C: row ${del.id} not found — aborting`)
      if (row.newSalary !== del.newSalary || row.employee.employeeCode !== 'CON-UIUX-005') {
        throw new Error(`C: row ${del.id} snapshot mismatch — aborting`)
      }
      await tx.compensationHistory.delete({ where: { id: del.id } })
      counts.deletedC++
      console.log(`  DELETE ${row.employee.fullName}: [${row.type} ${fmt(row.oldSalary)}→${fmt(row.newSalary)} eff ${row.effectiveDate.toISOString().slice(0, 10)}] → (removed) — ${del.why}`)
    }
    console.log()

    // ── D. Baseline corrections ─────────────────────────────────────────────
    console.log('── D. Baseline corrections (history REGULAR rows + Salary alignment) ──')
    for (const t of TARGETS) {
      const emp = byCode[t.code]
      const latest = await tx.compensationHistory.findFirst({
        where: { employeeId: emp.id },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      })
      const latestNew = latest?.newSalary ?? 0

      // Insert a correcting history row when HR mandated one, or when the
      // latest post-cleanup row still resolves to the wrong baseline.
      if (t.forceInsert || latestNew !== t.target) {
        const effDate = d(t.forceInsert ?? '2026-07-01')
        const created = await tx.compensationHistory.create({
          data: {
            employeeId: emp.id,
            type: 'REGULAR',
            oldSalary: latestNew,
            newSalary: t.target,
            incrementPct: latestNew > 0 ? ((t.target - latestNew) / latestNew) * 100 : null,
            reason: NOTE,
            notes: NOTE,
            effectiveDate: effDate,
          },
        })
        counts.insertedD++
        console.log(`  INSERT ${emp.fullName}: latest history →${fmt(latestNew)} → [REGULAR ${fmt(latestNew)}→${fmt(t.target)} eff ${effDate.toISOString().slice(0, 10)}] (${created.id})`)
      } else {
        console.log(`  OK     ${emp.fullName}: latest history already →${fmt(latestNew)} (eff ${latest.effectiveDate.toISOString().slice(0, 10)}) — no insert`)
      }

      // Align the Salary table — this is what the payroll generator reads.
      const sal = await tx.salary.findUnique({ where: { employeeId: emp.id } })
      const curGross = sal ? grossOf(sal) : null
      if (sal && curGross === t.target) {
        console.log(`         Salary already gross ${fmt(curGross)} — untouched`)
        continue
      }
      const breakdown = scaleBreakdown(sal, t.target)
      const effFrom = d(t.forceInsert ?? (latestNew === t.target && latest ? latest.effectiveDate.toISOString().slice(0, 10) : '2026-07-01'))
      if (sal) {
        await tx.salary.update({ where: { employeeId: emp.id }, data: { ...breakdown, effectiveFrom: effFrom } })
        counts.salaryAlignedD++
        console.log(`         Salary: gross ${fmt(curGross)} (effFrom ${sal.effectiveFrom.toISOString().slice(0, 10)}) → ${fmt(t.target)} (effFrom ${effFrom.toISOString().slice(0, 10)}) [basic ${fmt(sal.basic)}→${fmt(breakdown.basic)}]`)
      } else {
        await tx.salary.create({ data: { employeeId: emp.id, ...breakdown, effectiveFrom: effFrom } })
        counts.salaryCreatedD++
        console.log(`         Salary: (MISSING — payroll was skipping this employee!) → created gross ${fmt(t.target)} (effFrom ${effFrom.toISOString().slice(0, 10)})`)
      }
    }
  }, { timeout: 120000, maxWait: 20000 })

  // ── Final verification — resolve exactly like the payroll generator ───────
  // src/app/api/payroll/generate/route.ts pulls prisma.salary per employee and
  // pays gross = basic+houseRent+utilities+food+fuel+medicalAllowance+otherAllowance
  // (skipping the employee entirely when no Salary row exists).
  console.log('\n── FINAL VERIFICATION (payroll-generator resolution) ──')
  console.log('Employee'.padEnd(28) + 'Resolved'.padStart(10) + 'Target'.padStart(10) + '  OK' + '   Latest-history'.padStart(18))
  let allOk = true
  for (const t of TARGETS) {
    const emp = byCode[t.code]
    const sal = await prisma.salary.findUnique({ where: { employeeId: emp.id } })
    const resolved = sal ? grossOf(sal) : null
    const latest = await prisma.compensationHistory.findFirst({
      where: { employeeId: emp.id },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    })
    const ok = resolved === t.target
    if (!ok) allOk = false
    console.log(
      `${emp.fullName}`.padEnd(28) +
      `${resolved == null ? 'MISSING' : fmt(resolved)}`.padStart(10) +
      `${fmt(t.target)}`.padStart(10) +
      (ok ? '  ✅' : '  ❌') +
      `${latest ? fmt(latest.newSalary) : '—'}`.padStart(15),
    )
  }
  console.log(allOk ? '\nALL TARGETS RESOLVE CORRECTLY ✅' : '\nMISMATCHES REMAIN ❌')
  console.log(`\nCounts: A deleted=${counts.deletedA} | B reclassified=${counts.reclassifiedB} | C deleted=${counts.deletedC} | D history-inserted=${counts.insertedD}, salary-updated=${counts.salaryAlignedD}, salary-created=${counts.salaryCreatedD}`)
  if (!allOk) process.exitCode = 1
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('\nFAILED — transaction rolled back, no changes applied:\n', e)
  await prisma.$disconnect()
  process.exit(1)
})
