/**
 * GET /api/career/moves?from=<role>&basis=INTERESTS|SKILLS&exclude=a|b&employeeId=
 *
 * The roles somebody could move to next from `from`, ranked by how many of
 * their skill interests (or skills) the role uses, then by current openings.
 * The Career Path Builder calls this once per step.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveTalentAccess, canSeeTalent } from '@/lib/talent'
import { nextMoves, type MoveBasis } from '@/lib/queries/career'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const employeeId = sp.get('employeeId') || access.employeeId
  if (!employeeId) return NextResponse.json({ error: 'No employee record' }, { status: 400 })
  if (!(await canSeeTalent(access, employeeId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const from = sp.get('from') ?? ''
  if (!from) return NextResponse.json({ error: 'from is required' }, { status: 400 })
  const basis: MoveBasis = sp.get('basis') === 'SKILLS' ? 'SKILLS' : 'INTERESTS'
  const exclude = (sp.get('exclude') ?? '').split('|').filter(Boolean)

  const moves = await nextMoves({ employeeId, from, basis, exclude })
  return NextResponse.json({ moves: moves.slice(0, 15) })
}
