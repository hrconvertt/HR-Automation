/**
 * POST /api/letters/save — keep a letter written in Letters → Write a letter.
 *
 * body: { text, letterType, employeeId, purpose?, bankName?, destinationCountry?,
 *         travelFrom?, travelTo?, requestId?, letterId? }
 *
 *   letterId   — an existing letter: its wording is replaced.
 *   requestId  — a received request: it is approved with this wording and the
 *                employee is told it is ready.
 *   neither    — a letter HR wrote on its own: stored as issued.
 *
 * Every new letter gets its CON-LTR number here. HR only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { nextLetterNumbers } from '@/lib/letter-number'
import { notify } from '@/lib/notifications'
import { LETTER_TYPES, type LetterType } from '@/lib/letter-templates'
import { letterLabel, textToBody, type LetterText } from '@/lib/letter-text'
import { resolveLetterAccess } from '@/lib/letters-server'

const LIMITS = { paragraphs: 20, paragraphChars: 3000, lineChars: 200 }

function cleanText(t: Partial<LetterText> | undefined): LetterText | null {
  if (!t || !Array.isArray(t.paragraphs) || t.paragraphs.length > LIMITS.paragraphs) return null
  const line = (v: unknown) => (typeof v === 'string' ? v.slice(0, LIMITS.lineChars) : '')
  const paragraphs = t.paragraphs.map((p) => (typeof p === 'string' ? p.slice(0, LIMITS.paragraphChars) : '')).filter((p) => p.trim())
  if (paragraphs.length === 0) return null
  return {
    letterDate: line(t.letterDate),
    subject: line(t.subject),
    paragraphs,
    signatoryName: line(t.signatoryName),
    signatoryTitle: line(t.signatoryTitle),
  }
}

export async function POST(request: NextRequest) {
  const access = await resolveLetterAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.isHr) return NextResponse.json({ error: 'Only HR can save letters.' }, { status: 403 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const text = cleanText(body?.text as Partial<LetterText> | undefined)
  if (!text) return NextResponse.json({ error: 'The letter has no text.' }, { status: 400 })

  const str = (k: string) => (typeof body?.[k] === 'string' && (body[k] as string).trim() ? (body[k] as string).trim().slice(0, 500) : null)
  const date = (k: string) => {
    const v = str(k)
    const d = v ? new Date(v) : null
    return d && !Number.isNaN(d.getTime()) ? d : null
  }
  const stored = {
    letterText: JSON.stringify(text),
    letterBody: textToBody(text),
    signedByName: text.signatoryName || null,
    signedByTitle: text.signatoryTitle || null,
  }

  // An existing letter: new wording.
  const letterId = str('letterId')
  if (letterId) {
    const letter = await prisma.letterRequest.findUnique({ where: { id: letterId }, select: { id: true, status: true } })
    if (!letter) return NextResponse.json({ error: 'Letter not found.' }, { status: 404 })
    if (letter.status !== 'APPROVED' && letter.status !== 'GENERATED') {
      return NextResponse.json({ error: 'Only an approved or issued letter can be edited.' }, { status: 400 })
    }
    const updated = await prisma.letterRequest.update({ where: { id: letterId }, data: stored, select: { id: true, letterNumber: true, status: true } })
    return NextResponse.json({ letter: updated })
  }

  // A received request: approve it with this wording.
  const requestId = str('requestId')
  if (requestId) {
    const req = await prisma.letterRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, employeeId: true, letterType: true } })
    if (!req) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    if (req.status !== 'PENDING') return NextResponse.json({ error: `This request is already ${req.status.toLowerCase()}.` }, { status: 400 })
    const [letterNumber] = await nextLetterNumbers(prisma, new Date().getFullYear())
    const updated = await prisma.letterRequest.update({
      where: { id: requestId },
      data: { ...stored, status: 'APPROVED', letterNumber, reviewedAt: new Date(), reviewedById: access.userId },
      select: { id: true, letterNumber: true, status: true },
    })
    await notify({
      employeeId: req.employeeId,
      type: 'GENERAL',
      title: 'Letter approved',
      message: `Your ${letterLabel(req.letterType)} (${letterNumber}) is ready to download.`,
      link: `/dashboard/letters?open=${requestId}`,
    })
    return NextResponse.json({ letter: updated })
  }

  // A letter HR wrote on its own.
  const letterType = str('letterType') ?? ''
  if (letterType !== 'EMPLOYMENT' && !LETTER_TYPES.includes(letterType as LetterType)) {
    return NextResponse.json({ error: 'Pick a letter type.' }, { status: 400 })
  }
  const employeeId = str('employeeId')
  const emp = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } }) : null
  if (!emp) return NextResponse.json({ error: 'Pick an employee.' }, { status: 400 })

  const [letterNumber] = await nextLetterNumbers(prisma, new Date().getFullYear())
  const created = await prisma.letterRequest.create({
    data: {
      ...stored,
      employeeId: emp.id,
      letterType,
      purpose: str('purpose'),
      bankName: str('bankName'),
      destinationCountry: str('destinationCountry'),
      travelFrom: date('travelFrom'),
      travelTo: date('travelTo'),
      status: 'GENERATED',
      letterNumber,
      reviewedAt: new Date(),
      reviewedById: access.userId,
    },
    select: { id: true, letterNumber: true, status: true },
  })
  return NextResponse.json({ letter: created }, { status: 201 })
}
