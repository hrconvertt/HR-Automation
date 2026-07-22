import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rubrics = await prisma.interviewRubric.findMany({
      where: { requisitionId: id },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(rubrics)
  } catch (error) {
    console.error('[rubrics GET]', error)
    return NextResponse.json({ error: 'Failed to fetch rubrics' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { rubrics } = body as { rubrics: { skillName: string; skillCategory: string; weight: number; sortOrder: number }[] }

    // Delete existing rubrics and create new ones
    await prisma.$transaction(async (tx) => {
      await tx.interviewRubric.deleteMany({ where: { requisitionId: id } })
      if (rubrics && rubrics.length > 0) {
        await tx.interviewRubric.createMany({
          data: rubrics.map((r) => ({
            requisitionId: id,
            skillName: r.skillName,
            skillCategory: r.skillCategory || 'TECHNICAL',
            weight: r.weight || 1.0,
            sortOrder: r.sortOrder || 0,
          })),
        })
      }
    })

    const updated = await prisma.interviewRubric.findMany({
      where: { requisitionId: id },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(updated, { status: 201 })
  } catch (error) {
    console.error('[rubrics POST]', error)
    return NextResponse.json({ error: 'Failed to save rubrics' }, { status: 500 })
  }
}