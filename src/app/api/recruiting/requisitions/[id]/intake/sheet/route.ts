/**
 * POST /api/recruiting/requisitions/[id]/intake/sheet — read a screened sheet.
 *
 * multipart: file (Excel, CSV or PDF). Returns its headers and rows and a guess
 * of where each column goes. Nothing is saved; the commit route does that with
 * the mapping HR confirms.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveJobActor } from '@/lib/job-post-server'
import { parseScreeningColumns } from '@/lib/candidate-tracker'
import { IntakeError, readSheet, suggestMapping } from '@/lib/candidate-intake'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor
  const { id } = await params
  const job = await prisma.jobRequisition.findUnique({ where: { id }, select: { screeningColumns: true } })
  if (!job) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to import.' }, { status: 400 })
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: 'The file is larger than 4 MB. Split the sheet or remove images from it.' }, { status: 400 })
  }

  try {
    const table = await readSheet(Buffer.from(await file.arrayBuffer()), file.name, file.type)
    const screeningColumns = parseScreeningColumns(job.screeningColumns)
    return NextResponse.json({
      fileName: file.name,
      ...table,
      screeningColumns,
      mapping: suggestMapping(table.headers, screeningColumns),
    })
  } catch (e) {
    console.error('[intake sheet]', e)
    const status = e instanceof IntakeError ? e.status : 500
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read this file.' }, { status })
  }
}
