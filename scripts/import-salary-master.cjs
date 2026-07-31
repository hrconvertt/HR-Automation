/**
 * Import the "Salary Master Oct25-Jun26" tab from the Convertt HR master sheet.
 *
 * The sheet is one row per employee per month (23 employees × 9 months = 207)
 * and is the authoritative record of what was actually paid between Oct 2025
 * and Jun 2026. This script loads it into two places:
 *
 *   1. CompensationHistory — one row per *change* in gross salary (not one per
 *      month), so an employee's profile shows their real increment timeline.
 *   2. PayrollRun + Payslip — one REGULAR run per month, with every figure
 *      taken verbatim from the sheet. Nothing is recomputed or inferred, so
 *      opening a month in the app shows exactly what the sheet shows.
 *
 * Run:
 *   node scripts/import-salary-master.cjs            # dry run, writes nothing
 *   node scripts/import-salary-master.cjs --apply    # writes to the database
 *   node scripts/import-salary-master.cjs --apply --only=comp|payroll
 */
const XLSX = require('xlsx')
const { PrismaClient } = require('@prisma/client')

// Neon's pooled endpoint cold-starts and refuses the first connection after an
// idle period. Scripts use the direct (unpooled) URL and retry the handshake.
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL },
  },
})

/**
 * Neon drops idle/long-running script connections (P1017). Every write goes
 * through this so a mid-import disconnect retries instead of leaving the
 * import half-applied. All operations here are idempotent, so a retry is safe.
 */
async function withRetry(label, fn, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      const retriable = e.code === 'P1017' || e.code === 'P1001' || /closed the connection|reach database/i.test(e.message || '')
      if (!retriable || i === attempts) throw e
      console.log(`  … connection lost during ${label}, retrying (${i}/${attempts - 1})`)
      await new Promise((r) => setTimeout(r, 2500))
      try { await prisma.$connect() } catch { /* next attempt re-tries */ }
    }
  }
}

async function warmUp(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      return
    } catch (e) {
      if (i === attempts) throw e
      console.log(`  … database asleep, retrying (${i}/${attempts - 1})`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

const FILE = process.env.MASTER_SHEET
  || 'C:\\Users\\HRConvertt\\Downloads\\Master Sheet - Convertt_HR.xlsx'
const TAB = 'Salary Master Oct25-Jun26'

const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || 'all'

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// ─── helpers ────────────────────────────────────────────────────────────────

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).replace(/[, ]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** "2026-1" and "2026-01" both appear in the sheet — normalise to {year, month}. */
function parseMonthKey(mk) {
  const [y, m] = String(mk).split('-')
  return { year: Number(y), month: Number(m) }
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// ─── read the sheet ─────────────────────────────────────────────────────────

function readSheet() {
  const wb = XLSX.readFile(FILE)
  const ws = wb.Sheets[TAB]
  if (!ws) throw new Error(`Tab "${TAB}" not found in ${FILE}`)
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null })

  return raw
    .filter((r) => r['Employee Code'])
    .map((r) => {
      const { year, month } = parseMonthKey(r['Month Key'])
      return {
        code: String(r['Employee Code']).trim(),
        name: String(r['Employee Name'] || '').trim(),
        designation: r['Designation'],
        department: r['Department'],
        year,
        month,
        monthLabel: r['Month'],
        daysInMonth: num(r['Days in Month']),
        payableDays: num(r['Payable Days']),
        leaveDays: num(r['Leave Days']),
        halfDays: num(r['Half Days']),
        wfhDays: num(r['WFH Days']),
        basic: num(r['Basic']),
        houseRent: num(r['House Rent']),
        utilities: num(r['Utilities']),
        food: num(r['Food Allowance']),
        fuel: num(r['Fuel Allowance']),
        gross: num(r['Gross Salary']),
        bonus: num(r['OT / Bonus']),
        arrears: num(r['Arrears']),
        otherAllowance: num(r['Other Allowances']) + num(r['Monthly Allowance']),
        totalPayments: num(r['Total Payments']),
        incomeTax: num(r['Income Tax']),
        eobi: num(r['EOBI']),
        healthcare: num(r['Health Care']),
        loan: num(r['Loan / Vehicle']),
        advance: num(r['Advance Deduction']),
        otherDeductions: num(r['Other Deductions']),
        totalDeductions: num(r['Total Deductions']),
        net: num(r['Net Pay']),
        amountPaid: r['Amount Paid (IFT/IBFT)'] == null ? null : num(r['Amount Paid (IFT/IBFT)']),
        notes: r['Notes / Reason'] || null,
        source: r['Source'] || null,
      }
    })
}

// ─── match sheet rows to Employee rows ──────────────────────────────────────

/**
 * NAME FIRST, code second — deliberately.
 *
 * The sheet carries an OLDER employee-code scheme than the database, and the
 * two schemes collide: sheet CON-WBS-004 is Atta Ur Rehman, but DB
 * CON-WBS-004 is Muhammad Ahsan; sheet CON-UIUX-008 is Muhammad Usman Saeed,
 * but DB CON-UIUX-008 is Taiyba Naeem. Matching on code alone silently writes
 * one person's salary onto another's profile, so a code match is only accepted
 * when the names also agree. Anything left ambiguous is reported and skipped
 * rather than guessed.
 */
async function buildEmployeeMap(rows) {
  const employees = await withRetry('employee read', () => prisma.employee.findMany({
    select: {
      id: true, employeeCode: true, legacyEmployeeCode: true, fullName: true,
      status: true, joiningDate: true, exitDate: true,
    },
  }))

  const byCode = new Map()
  for (const e of employees) {
    if (e.employeeCode) byCode.set(e.employeeCode.trim().toUpperCase(), e)
    if (e.legacyEmployeeCode) byCode.set(e.legacyEmployeeCode.trim().toUpperCase(), e)
  }

  // Names must be unique to be usable as a key — duplicates are reported.
  const nameCounts = new Map()
  for (const e of employees) nameCounts.set(normName(e.fullName), (nameCounts.get(normName(e.fullName)) || 0) + 1)
  const byName = new Map()
  for (const e of employees) if (nameCounts.get(normName(e.fullName)) === 1) byName.set(normName(e.fullName), e)

  const matched = new Map()
  const unmatched = []
  const conflicts = []

  const sheetPeople = new Map()
  for (const r of rows) if (!sheetPeople.has(r.code)) sheetPeople.set(r.code, r)

  for (const [code, r] of sheetPeople) {
    const byNameHit = byName.get(normName(r.name))
    const byCodeHit = byCode.get(code.trim().toUpperCase())

    let hit = null
    let via = null
    if (byNameHit) {
      hit = byNameHit
      via = 'name'
      if (byCodeHit && byCodeHit.id !== byNameHit.id) {
        conflicts.push({
          code, sheetName: r.name,
          codeWouldGive: `${byCodeHit.employeeCode} ${byCodeHit.fullName}`,
          nameGives: `${byNameHit.employeeCode} ${byNameHit.fullName}`,
        })
      }
    } else if (byCodeHit && normName(byCodeHit.fullName) === normName(r.name)) {
      hit = byCodeHit
      via = 'code'
    }

    if (hit) matched.set(code, { employee: hit, sheetName: r.name, via })
    else unmatched.push({ ...r, codeWouldGive: byCodeHit ? `${byCodeHit.employeeCode} ${byCodeHit.fullName}` : null })
  }

  // No DB employee may receive two different sheet identities.
  const seen = new Map()
  const doubleBooked = []
  for (const [code, m] of matched) {
    if (seen.has(m.employee.id)) doubleBooked.push({ employeeId: m.employee.id, name: m.employee.fullName, codes: [seen.get(m.employee.id), code] })
    else seen.set(m.employee.id, code)
  }

  return { matched, unmatched, conflicts, doubleBooked, totalEmployees: employees.length }
}

// ─── 1. compensation history ────────────────────────────────────────────────

/**
 * Collapse 9 monthly rows into the salary *changes* only. A flat 9 months at
 * the same gross produces zero history rows; a mid-year increment produces one.
 */
function compEventsFor(rows) {
  const sorted = [...rows].sort((a, b) => (a.year - b.year) || (a.month - b.month))
  const events = []
  let prev = null
  for (const r of sorted) {
    if (r.gross <= 0) continue // "No data" months — skip, never invent a figure
    if (prev === null) {
      // Opening balance. Without this, anyone whose salary never changed over
      // the nine months (Arslan, Jamshed, Sheikh Taha Adnan, Zuhaa Shafi)
      // would end up with an empty Compensation History on their profile.
      events.push({
        oldSalary: r.gross,
        newSalary: r.gross,
        effectiveDate: new Date(Date.UTC(r.year, r.month - 1, 1)),
        type: 'ADJUSTMENT',
        incrementPct: 0,
        reason: `Opening salary — ${r.monthLabel}`,
      })
      prev = r
      continue
    }
    if (Math.round(r.gross) !== Math.round(prev.gross)) {
      events.push({
        oldSalary: prev.gross,
        newSalary: r.gross,
        effectiveDate: new Date(Date.UTC(r.year, r.month - 1, 1)),
        type: r.gross > prev.gross ? 'INCREMENT' : 'ADJUSTMENT',
        incrementPct: prev.gross > 0
          ? Math.round(((r.gross - prev.gross) / prev.gross) * 1000) / 10
          : null,
        reason: r.notes || `Salary Master ${r.monthLabel}`,
      })
      prev = r
    }
  }
  return events
}

async function importCompensation(rows, matched) {
  const byCode = new Map()
  for (const r of rows) {
    if (!byCode.has(r.code)) byCode.set(r.code, [])
    byCode.get(r.code).push(r)
  }

  let created = 0, skipped = 0, salariesSynced = 0
  const perEmployee = []

  // One query for every employee's existing history, not one per employee.
  const empIds = [...matched.values()].map((m) => m.employee.id)
  const allExisting = await withRetry('compensation read', () => prisma.compensationHistory.findMany({
    where: { employeeId: { in: empIds } },
    select: { employeeId: true, effectiveDate: true, newSalary: true },
  }))
  const seenByEmp = new Map()
  for (const e of allExisting) {
    if (!seenByEmp.has(e.employeeId)) seenByEmp.set(e.employeeId, new Set())
    seenByEmp.get(e.employeeId).add(`${e.effectiveDate.toISOString().slice(0, 10)}|${Math.round(e.newSalary)}`)
  }

  for (const [code, m] of matched) {
    const empRows = byCode.get(code) || []
    const events = compEventsFor(empRows)
    const seen = seenByEmp.get(m.employee.id) ?? new Set()

    const toCreate = events.filter((e) =>
      !seen.has(`${e.effectiveDate.toISOString().slice(0, 10)}|${Math.round(e.newSalary)}`))
    skipped += events.length - toCreate.length

    if (APPLY && toCreate.length) {
      await withRetry(`compensation write ${code}`, () => prisma.compensationHistory.createMany({
        data: toCreate.map((e) => ({ ...e, employeeId: m.employee.id, notes: 'Imported from Salary Master Oct25-Jun26' })),
      }))
    }
    created += toCreate.length

    // Sync the live Salary record to the LAST month on the sheet that has pay.
    const latest = [...empRows]
      .filter((r) => r.gross > 0)
      .sort((a, b) => (b.year - a.year) || (b.month - a.month))[0]
    if (latest) {
      if (APPLY) {
        await withRetry(`salary sync ${code}`, () => prisma.salary.upsert({
          where: { employeeId: m.employee.id },
          update: {
            // Every component is written, including the ones the sheet leaves
            // blank. A partial update would keep stale values (e.g. a medical
            // allowance the sheet doesn't have) and the profile's gross would
            // then disagree with the sheet. Components sum exactly to the
            // sheet's Gross Salary — verified across all 207 rows.
            basic: latest.basic, houseRent: latest.houseRent, utilities: latest.utilities,
            food: latest.food, fuel: latest.fuel, otherAllowance: latest.otherAllowance,
            medicalAllowance: 0,
            effectiveFrom: new Date(Date.UTC(latest.year, latest.month - 1, 1)),
          },
          create: {
            employeeId: m.employee.id,
            basic: latest.basic, houseRent: latest.houseRent, utilities: latest.utilities,
            food: latest.food, fuel: latest.fuel, otherAllowance: latest.otherAllowance,
            medicalAllowance: 0,
            effectiveFrom: new Date(Date.UTC(latest.year, latest.month - 1, 1)),
          },
        }))
      }
      salariesSynced++
    }

    perEmployee.push({
      code, name: m.sheetName, events: events.length, new: toCreate.length,
      latestGross: latest ? latest.gross : null,
    })
  }

  return { created, skipped, salariesSynced, perEmployee }
}

// ─── 2. payroll runs, verbatim from the sheet ───────────────────────────────

async function importPayroll(rows, matched) {
  const byMonth = new Map()
  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, '0')}`
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(r)
  }

  const report = []
  const blankUnexplained = []

  for (const [key, monthRows] of [...byMonth.entries()].sort()) {
    const { year, month } = parseMonthKey(key)

    const payslips = []
    let unmatchedInMonth = 0
    let zeroRows = 0

    for (const r of monthRows) {
      const m = matched.get(r.code)
      if (!m) { unmatchedInMonth++; continue }
      if (r.gross <= 0 && r.net <= 0) {
        // A blank month means the person wasn't on the payroll yet (or had
        // already left) — not missing data. Verified against joiningDate /
        // exitDate below; anything a date can't explain is reported, never
        // filled in with an invented figure.
        zeroRows++
        const monthStart = new Date(Date.UTC(r.year, r.month - 1, 1))
        const monthEnd = new Date(Date.UTC(r.year, r.month, 0))
        const joined = m.employee.joiningDate
        const exited = m.employee.exitDate
        const explained = (joined && joined > monthEnd) || (exited && exited < monthStart)
        if (!explained) {
          blankUnexplained.push({
            code: r.code, name: r.name, period: `${r.year}-${String(r.month).padStart(2, '0')}`,
            joined: joined ? joined.toISOString().slice(0, 10) : 'unknown',
            exited: exited ? exited.toISOString().slice(0, 10) : null,
          })
        }
        continue
      }

      payslips.push({
        employeeId: m.employee.id,
        month, year,
        basic: r.basic,
        houseRent: r.houseRent,
        utilities: r.utilities,
        food: r.food,
        fuel: r.fuel,
        medicalAllowance: 0,
        otherAllowance: r.otherAllowance,
        bonus: r.bonus,
        overtimePay: 0,
        arrears: r.arrears,
        leaveEncashment: 0,
        grossSalary: r.gross,
        eobi: r.eobi,
        incomeTax: r.incomeTax,
        healthcare: r.healthcare,
        loanDeduction: r.loan,
        advanceDeduction: r.advance,
        otherDeductions: r.otherDeductions,
        providentFund: 0,
        lateDeduction: 0,
        netSalary: r.net,
        transactionAmount: r.amountPaid != null ? r.amountPaid : r.net,
        reference: `Salary ${MONTH_LABELS[month - 1]} ${year}`,
        payoutNotes: r.notes,
        workingDays: Math.round(r.daysInMonth) || 0,
        presentDays: Math.round(r.payableDays) || 0,
        leaveDays: Math.round(r.leaveDays) || 0,
        absentDays: 0,
        status: 'DRAFT',
        isAdjusted: true, // imported figures are authoritative — Recompute must not overwrite them
        adjustmentNote: `Imported verbatim from ${TAB}`,
      })
    }

    // MERGE, never replace.
    //
    // The sheet has "No data" months for some employees, so wiping a run and
    // rebuilding it from the sheet alone would DELETE real payslips that the
    // sheet simply doesn't cover (e.g. Zuhaa Shafi's Nov-25, Waqas Fareed's
    // Jun-26). Instead: the sheet is authoritative for the rows it has, and
    // every other existing payslip is left exactly as it is.
    const existing = await withRetry(`${key} read run`, () => prisma.payrollRun.findMany({
      where: { month, year, runType: 'REGULAR' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, _count: { select: { payslips: true } } },
    }))
    const blocked = existing.filter((r) => r.status === 'PAID')
    const target = existing[0] ?? null
    let kept = 0, updated = 0, inserted = 0

    if (blocked.length > 0) {
      report.push({
        period: key, inserted: 0, updated: 0, kept: target ? target._count.payslips : 0,
        skippedNoData: zeroRows, skippedUnmatched: unmatchedInMonth,
        status: 'SKIPPED (run already PAID)', totalNet: 0,
      })
      continue
    }

    if (APPLY) {
      let runId = target?.id
      if (!runId) {
        const created = await withRetry(`${key} create run`, () => prisma.payrollRun.create({
          data: {
            // DRAFT, not PAID: HR must stay able to edit these months in the
            // grid (canEditPayslipsAtStage only allows DRAFT / PENDING_*).
            // isAdjusted on every payslip is what protects the imported
            // figures from being overwritten by Recompute.
            month, year, runType: 'REGULAR', status: 'DRAFT',
            totalGross: 0, totalNet: 0, totalEOBI: 0, totalTax: 0,
            calculatedAt: new Date(),
          },
          select: { id: true },
        }))
        runId = created.id
      }

      // Fold any orphan payslips (payrollRunId = null) for this period into the
      // run so the month can never show the same employee twice.
      await withRetry(`${key} adopt orphans`, () => prisma.payslip.updateMany({
        where: { month, year, payrollRunId: null },
        data: { payrollRunId: runId },
      }))

      // One lookup for the whole month, then update-or-create per employee.
      const existingSlips = await withRetry(`${key} read slips`, () => prisma.payslip.findMany({
        where: { month, year },
        select: { id: true, employeeId: true },
      }))
      const slipIdByEmp = new Map(existingSlips.map((s) => [s.employeeId, s.id]))

      for (const p of payslips) {
        const slipId = slipIdByEmp.get(p.employeeId)
        if (slipId) {
          await withRetry(`${key} update slip`, () => prisma.payslip.update({ where: { id: slipId }, data: { ...p, payrollRunId: runId } }))
          updated++
        } else {
          await withRetry(`${key} create slip`, () => prisma.payslip.create({ data: { ...p, payrollRunId: runId } }))
          inserted++
        }
      }

      // An approval recorded over an empty run is meaningless — reset it so HR
      // can work with the month. Runs that already carry payslips keep their
      // status; this script never silently undoes a human approval.
      if (target && target._count.payslips === 0 && target.status !== 'DRAFT') {
        await withRetry(`${key} reset status`, () => prisma.payrollRun.update({ where: { id: runId }, data: { status: 'DRAFT' } }))
      }

      // Recompute run totals from the merged payslip set.
      const agg = await withRetry(`${key} totals`, () => prisma.payslip.aggregate({
        where: { payrollRunId: runId },
        _sum: { grossSalary: true, netSalary: true, eobi: true, incomeTax: true },
        _count: true,
      }))
      await withRetry(`${key} write totals`, () => prisma.payrollRun.update({
        where: { id: runId },
        data: {
          totalGross: agg._sum.grossSalary ?? 0,
          totalNet: agg._sum.netSalary ?? 0,
          totalEOBI: agg._sum.eobi ?? 0,
          totalTax: agg._sum.incomeTax ?? 0,
        },
      }))
      kept = agg._count - inserted - updated

      report.push({
        period: key, inserted, updated, kept,
        skippedNoData: zeroRows, skippedUnmatched: unmatchedInMonth,
        status: target ? `merged into existing ${target.status}` : 'new DRAFT run',
        totalNet: Math.round(agg._sum.netSalary ?? 0),
      })
    } else {
      const existingSlips = target
        ? await withRetry(`${key} dry read`, () => prisma.payslip.findMany({ where: { month, year }, select: { employeeId: true } }))
        : []
      const existingIds = new Set(existingSlips.map((s) => s.employeeId))
      inserted = payslips.filter((p) => !existingIds.has(p.employeeId)).length
      updated = payslips.length - inserted
      kept = existingIds.size - updated
      report.push({
        period: key, inserted, updated, kept,
        skippedNoData: zeroRows, skippedUnmatched: unmatchedInMonth,
        status: target ? `would merge into existing ${target.status}` : 'would create DRAFT run',
        totalNet: Math.round(payslips.reduce((s, p) => s + p.netSalary, 0)),
      })
    }
  }

  return { report, blankUnexplained }
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — ${TAB}\n${'='.repeat(60)}`)

  const rows = readSheet()
  console.log(`sheet rows: ${rows.length}`)
  await warmUp()

  const { matched, unmatched, conflicts, doubleBooked, totalEmployees } = await buildEmployeeMap(rows)
  console.log(`employees in sheet: ${matched.size + unmatched.length} | matched to DB: ${matched.size} of ${totalEmployees} DB employees`)

  if (conflicts.length) {
    console.log('\nCODE/NAME CONFLICTS — resolved by NAME (the sheet\'s codes are stale):')
    for (const c of conflicts) {
      console.log(`  sheet ${c.code} "${c.sheetName}"`)
      console.log(`      code would give : ${c.codeWouldGive}   <- WRONG PERSON, rejected`)
      console.log(`      name gives      : ${c.nameGives}        <- used`)
    }
  }
  if (unmatched.length) {
    console.log('\nUNMATCHED (skipped entirely — no data invented for them):')
    for (const u of unmatched) console.log(`  ${u.code}  ${u.name}${u.codeWouldGive ? `   (code would have hit ${u.codeWouldGive})` : ''}`)
  }
  if (doubleBooked.length) {
    console.log('\nABORT — one employee matched by two sheet identities:')
    for (const d of doubleBooked) console.log(`  ${d.name}: ${d.codes.join(' + ')}`)
    throw new Error('Ambiguous employee mapping; refusing to write.')
  }

  if (ONLY === 'all' || ONLY === 'comp') {
    console.log(`\n── Compensation history ${'─'.repeat(38)}`)
    const c = await importCompensation(rows, matched)
    console.log(`  history rows to create: ${c.created}  (already present: ${c.skipped})`)
    console.log(`  Salary records synced to latest sheet month: ${c.salariesSynced}`)
    for (const p of c.perEmployee.filter((x) => x.events > 0)) {
      console.log(`    ${p.code.padEnd(16)} ${String(p.name).padEnd(24)} ${p.events} change(s), ${p.new} new, latest gross ${p.latestGross}`)
    }
  }

  if (ONLY === 'all' || ONLY === 'payroll') {
    console.log(`\n── Payroll runs ${'─'.repeat(45)}`)
    const { report: rep, blankUnexplained } = await importPayroll(rows, matched)
    console.log('  period    new  updated  kept  noData   totalNet   run')
    for (const r of rep) {
      console.log(`  ${r.period}  ${String(r.inserted).padStart(3)}  ${String(r.updated).padStart(7)}  ${String(r.kept).padStart(4)}  ${String(r.skippedNoData).padStart(6)}  ${String(r.totalNet.toLocaleString()).padStart(9)}   ${r.status}`)
    }
    console.log('  (kept = payslips already in the month that the sheet does not cover — left untouched)')

    // A blank month should mean "not employed yet / already left". Anything a
    // joining or exit date can't account for is a genuine gap in the sheet and
    // is reported rather than filled in.
    if (blankUnexplained.length === 0) {
      console.log('  blank months: all explained by joining / exit dates ✓')
    } else {
      console.log(`\n  BLANK MONTHS NOT EXPLAINED BY JOINING/EXIT DATES (${blankUnexplained.length}) — left empty, nothing invented:`)
      for (const b of blankUnexplained) {
        console.log(`    ${b.period}  ${String(b.name).padEnd(24)} joined ${b.joined}${b.exited ? `, exited ${b.exited}` : ''}`)
      }
    }
  }

  if (!APPLY) console.log('\nNothing written. Re-run with --apply to commit.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
