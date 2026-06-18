import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// Returns the canonical list of designations currently in use across the
// org, deduped + sorted. Powers the Designation combobox so HR doesn't
// retype "Sr. Software Engineer" / "Senior Software Engineer" / etc.
export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Position titles (canonical source if HR populates Positions)
  const positions = await prisma.position.findMany({
    select: { title: true },
    distinct: ['title'],
  })

  // 2. Distinct Employee.designation values (what HR actually typed in)
  const employees = await prisma.employee.findMany({
    where: { designation: { not: '' } },
    select: { designation: true },
    distinct: ['designation'],
  })

  const set = new Set<string>()
  for (const p of positions) if (p.title?.trim()) set.add(p.title.trim())
  for (const e of employees) if (e.designation?.trim()) set.add(e.designation.trim())

  const designations = Array.from(set).sort((a, b) => a.localeCompare(b))
  return NextResponse.json({ designations })
}
