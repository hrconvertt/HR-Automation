/**
 * POST /api/recruiting/jobs/parse-jd — read an uploaded job description and
 * return the job post form's boxes filled from it. Nothing is saved: the
 * editor puts the values in the form for the person to check and save.
 *
 * Body (multipart): file — PDF, .docx or text; departments — JSON array of
 * the department names the form offers.
 *
 * Same people as the job post editor itself: HR and hiring managers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveJobActor } from '@/lib/job-post-server'
import { extractJobPost, JdExtractError } from '@/lib/jd-extract'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const actor = await resolveJobActor(request)
  if (actor instanceof NextResponse) return actor

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Upload a file.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Upload a file.' }, { status: 400 })

  let departments: string[] = []
  try {
    const parsed = JSON.parse(String(form.get('departments') ?? '[]'))
    if (Array.isArray(parsed)) {
      departments = parsed.filter((d): d is string => typeof d === 'string' && d.trim().length > 0).slice(0, 200)
    }
  } catch { /* no department list: the answer names one freely and the form ignores a non-match */ }

  try {
    const job = await extractJobPost({
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type,
      departments,
    })
    return NextResponse.json({ job, filename: file.name })
  } catch (err) {
    if (err instanceof JdExtractError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[parse-jd]', err)
    return NextResponse.json({ error: 'That file could not be read.' }, { status: 500 })
  }
}
