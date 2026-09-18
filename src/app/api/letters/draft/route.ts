/**
 * GET /api/letters/draft?type=&employeeId=&purpose=&bankName=&destinationCountry=&travelFrom=&travelTo=
 *
 * A letter of that type written from the employee's record, as editor text.
 * Nothing is saved. HR only. (The employment letter has its own writer at
 * /api/documents/employment-letter?defaults=1.)
 */
import { NextRequest, NextResponse } from 'next/server'
import { LETTER_TYPES, type LetterType } from '@/lib/letter-templates'
import { draftTemplateLetter, resolveLetterAccess } from '@/lib/letters-server'

export async function GET(request: NextRequest) {
  const access = await resolveLetterAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.isHr) return NextResponse.json({ error: 'Only HR can write letters.' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const type = sp.get('type') ?? ''
  const employeeId = sp.get('employeeId') ?? ''
  if (!LETTER_TYPES.includes(type as LetterType)) return NextResponse.json({ error: 'Pick a letter type.' }, { status: 400 })
  if (!employeeId) return NextResponse.json({ error: 'Pick an employee.' }, { status: 400 })

  const date = (k: string) => {
    const v = sp.get(k)
    const d = v ? new Date(v) : null
    return d && !Number.isNaN(d.getTime()) ? d : null
  }
  const draft = await draftTemplateLetter(type, employeeId, {
    purpose: sp.get('purpose') || null,
    bankName: sp.get('bankName') || null,
    destinationCountry: sp.get('destinationCountry') || null,
    travelFrom: date('travelFrom'),
    travelTo: date('travelTo'),
  })
  if (!draft) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })
  return NextResponse.json(draft)
}
