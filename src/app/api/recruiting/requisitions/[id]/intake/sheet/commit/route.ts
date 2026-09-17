/**
 * POST /api/recruiting/requisitions/[id]/intake/sheet/commit — file the rows.
 *
 * body: {
 *   fileName, headers: string[], rows: string[][],
 *   mapping: a target per header — 'name' | 'stage' | tracker key |
 *            'screening:<label>' | 'new:<label>' | '' (skip),
 *   onDuplicate: 'update' | 'skip'
 * }
 *
 * A row is somebody already on this role when its email matches theirs, or,
 * with no email, its name does. 'update' writes the sheet's filled cells over
 * theirs — the sheet is the screened record — and leaves the rest alone.
 * New columns join the role's screening columns (HR only).
 */
import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import {
  parseScreening, parseScreeningColumns, sanitizeScreeningColumns, trackerColumn,
} from '@/lib/candidate-tracker'
import { MAX_IMPORT_ROWS, stageFrom } from '@/lib/candidate-intake'

export const runtime = 'nodejs'
export const maxDuration = 120

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const nameKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({ where: { id }, select: { id: true, screeningColumns: true } })
  if (!job) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  const body = await request.json().catch(() => null) as {
    fileName?: unknown; headers?: unknown; rows?: unknown; mapping?: unknown; onDuplicate?: unknown
  } | null
  const headers = Array.isArray(body?.headers) ? body.headers.map((h) => String(h ?? '')) : []
  const rows = Array.isArray(body?.rows)
    ? body.rows.filter(Array.isArray).map((r) => (r as unknown[]).map((c) => String(c ?? '').trim()))
    : []
  const mapping = Array.isArray(body?.mapping) ? body.mapping.map((m) => String(m ?? '')) : []
  const onDuplicate = body?.onDuplicate === 'skip' ? 'skip' : 'update'
  const fileName = String(body?.fileName ?? 'a screening sheet').slice(0, 200)

  if (!headers.length || mapping.length !== headers.length) {
    return NextResponse.json({ error: 'Send the headers with one mapping each.' }, { status: 400 })
  }
  if (!rows.length) return NextResponse.json({ error: 'There are no rows to import.' }, { status: 400 })
  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `Import up to ${MAX_IMPORT_ROWS} rows at a time.` }, { status: 400 })
  }
  const nameCol = mapping.indexOf('name')
  if (nameCol < 0) return NextResponse.json({ error: 'Choose which column holds the candidate’s name.' }, { status: 400 })

  // Every target checked before anything is written.
  const existingCols = parseScreeningColumns(job.screeningColumns)
  const newCols: string[] = []
  for (const m of mapping) {
    if (!m || m === 'name' || m === 'stage') continue
    if (m.startsWith('screening:')) {
      if (!existingCols.includes(m.slice(10))) {
        return NextResponse.json({ error: `Unknown screening column: ${m.slice(10)}` }, { status: 400 })
      }
    } else if (m.startsWith('new:')) {
      newCols.push(m.slice(4))
    } else if (!trackerColumn(m)) {
      return NextResponse.json({ error: `Unknown column: ${m}` }, { status: 400 })
    }
  }
  const fixedTargets = mapping.filter((m) => m && !m.startsWith('new:'))
  if (new Set(fixedTargets).size !== fixedTargets.length) {
    return NextResponse.json({ error: 'Two sheet columns go into the same column. Choose one of them.' }, { status: 400 })
  }
  if (newCols.length && !actor.isHR) {
    return NextResponse.json(
      { error: 'Only HR can add screening columns. Put those sheet columns into an existing column, or skip them.' },
      { status: 403 },
    )
  }
  const added = newCols.filter((c) => !existingCols.some((e) => e.toLowerCase() === c.toLowerCase()))
  if (added.length) {
    const all = sanitizeScreeningColumns([...existingCols, ...added])
    await prisma.jobRequisition.update({ where: { id }, data: { screeningColumns: JSON.stringify(all) } })
  }

  const people = await prisma.candidate.findMany({
    where: { requisitionId: id },
    select: { id: true, email: true, fullName: true, screening: true },
  })
  const byEmail = new Map(
    people.filter((p) => EMAIL.test(p.email) && !p.email.endsWith('@no-email.com')).map((p) => [p.email.toLowerCase(), p]),
  )
  const byName = new Map(people.map((p) => [nameKey(p.fullName), p]))

  let updated = 0
  const skipped: string[] = []
  const toCreate: Prisma.CandidateCreateManyInput[] = []
  const seenInFile = new Set<string>()

  for (const [i, row] of rows.entries()) {
    const line = `Row ${i + 1}`
    const fullName = (row[nameCol] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!fullName) { skipped.push(`${line}: no name`); continue }

    const fields: Record<string, string | number> = {}
    const screening: Record<string, string> = {}
    let stage: string | null = null
    mapping.forEach((m, c) => {
      const v = (row[c] ?? '').trim()
      if (!v || !m || m === 'name') return
      if (m === 'stage') { stage = stageFrom(v); return }
      if (m.startsWith('screening:')) { screening[m.slice(10)] = v.slice(0, 1000); return }
      if (m.startsWith('new:')) { screening[m.slice(4)] = v.slice(0, 1000); return }
      const col = trackerColumn(m)
      if (!col) return
      if (col.key === 'matchScore') {
        const n = parseFloat(v.replace('%', ''))
        if (Number.isFinite(n) && n >= 0 && n <= 100) fields.matchScore = n
        return
      }
      fields[col.key] = v.slice(0, col.long ? 6000 : 1000)
    })

    const email = typeof fields.email === 'string' && EMAIL.test(fields.email) ? fields.email.toLowerCase() : null
    delete fields.email
    const key = email ?? nameKey(fullName)
    if (seenInFile.has(key)) { skipped.push(`${line}: ${fullName} is in the file twice`); continue }
    seenInFile.add(key)

    const match = (email ? byEmail.get(email) : undefined) ?? byName.get(nameKey(fullName))
    if (match) {
      if (onDuplicate === 'skip') { skipped.push(`${line}: ${fullName} is already on this role`); continue }
      const data: Prisma.CandidateUncheckedUpdateInput = { ...fields }
      if (email) data.email = email
      if (stage) data.stage = stage
      if (Object.keys(screening).length) data.screening = JSON.stringify({ ...parseScreening(match.screening), ...screening })
      if (Object.keys(data).length === 0) { skipped.push(`${line}: ${fullName} — nothing to add`); continue }
      await prisma.candidate.update({ where: { id: match.id }, data })
      updated++
      continue
    }

    toCreate.push({
      ...fields,
      requisitionId: id,
      fullName,
      email: email ?? `unknown-${Date.now()}-${i}@no-email.com`,
      stage: stage ?? 'APPLIED',
      source: 'SHEET_IMPORT',
      screening: Object.keys(screening).length ? JSON.stringify(screening) : null,
      notes: `Imported from ${fileName}`,
    })
  }

  let created = 0
  for (let i = 0; i < toCreate.length; i += 200) {
    created += (await prisma.candidate.createMany({ data: toCreate.slice(i, i + 200) })).count
  }

  return NextResponse.json({
    created, updated, skipped: skipped.length, skippedReasons: skipped.slice(0, 50), newColumns: added,
  })
}
