/**
 * Save a generated document into the employee's Document record.
 *
 * Stores the regeneration URL (with extras encoded) so the document can be
 * re-pulled later. The blob isn't stored â€” we save the recipe.
 *
 * Why store the URL not the HTML?
 *   - HTML is large (5â€“10 KB per doc) and not searchable
 *   - Templates may evolve; regenerating from the same params ensures
 *     consistency or shows the latest version
 *   - We capture the exact extras at the moment of issuance for audit
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

// Map document-generator types â†’ EmployeeDocument.type values
const TYPE_MAP: Record<string, string> = {
  offer_letter:                'OFFER_LETTER',
  employment_agreement:        'EMPLOYMENT_AGREEMENT',
  employment_agreement_intern: 'EMPLOYMENT_AGREEMENT',
  nda:                         'NDA',
  show_cause_notice:           'SHOW_CAUSE',
  notice_period_letter:        'NOTICE_PERIOD',
  termination_letter:          'TERMINATION_LETTER',
  experience_letter:           'EXPERIENCE',
  confirmation_letter:         'CONFIRMATION_LETTER',
  exit_clearance_form:         'EXIT_CLEARANCE',
  exit_interview_form:         'EXIT_INTERVIEW',
}

const FRIENDLY_NAMES: Record<string, string> = {
  offer_letter:                'Offer Letter',
  employment_agreement:        'Employment Agreement (Permanent)',
  employment_agreement_intern: 'Employment Agreement (Internship)',
  nda:                         'NDA',
  show_cause_notice:           'Show Cause Notice',
  notice_period_letter:        'Notice Period Letter',
  termination_letter:          'Termination Letter',
  experience_letter:           'Experience Letter',
  confirmation_letter:         'Confirmation Letter',
  exit_clearance_form:         'Exit Clearance Form',
  exit_interview_form:         'Exit Interview Form',
}

const HR_ONLY_TYPES = new Set([
  'offer_letter', 'employment_agreement', 'employment_agreement_intern',
  'show_cause_notice', 'notice_period_letter', 'termination_letter', 'confirmation_letter',
])

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { type, employeeId, extras } = body as {
    type: string
    employeeId: string
    extras?: Record<string, string | number | undefined>
  }

  if (!type || !employeeId) {
    return NextResponse.json({ error: 'type + employeeId required' }, { status: 400 })
  }
  if (!TYPE_MAP[type]) {
    return NextResponse.json({ error: `Unknown document type: ${type}` }, { status: 400 })
  }

  if (HR_ONLY_TYPES.has(type) && !hasRole(payload, 'HR_ADMIN')) {
    return NextResponse.json({ error: 'Only HR may save this document' }, { status: 403 })
  }

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { fullName: true },
  })
  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  // Build regen URL with extras
  const params = new URLSearchParams({ type, employeeId })
  if (extras) {
    for (const [k, v] of Object.entries(extras)) {
      if (v !== undefined && v !== null && String(v).length > 0) {
        params.set(k, String(v))
      }
    }
  }
  const regenUrl = `/api/documents/generate?${params.toString()}`

  const doc = await prisma.employeeDocument.create({
    data: {
      employeeId,
      type: TYPE_MAP[type],
      name: `${FRIENDLY_NAMES[type]} - ${emp.fullName} - ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      url: regenUrl,
      uploadedById: payload.userId,
      signedAt: null,
    },
  })

  return NextResponse.json({ document: doc, url: regenUrl })
}

// GET: list saved docs for an employee (optionally filtered by type)
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')
  const type = searchParams.get('type')
  if (!employeeId) return NextResponse.json({ error: 'employeeId required' }, { status: 400 })

  const where: Record<string, unknown> = { employeeId }
  if (type) where.type = TYPE_MAP[type] ?? type

  const documents = await prisma.employeeDocument.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ documents })
}
