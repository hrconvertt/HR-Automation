import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

interface ParsedJD {
  title: string
  department?: string
  positionLevel?: string
  type?: string
  vacancies?: number
  description?: string
  requirements?: string
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string
  minExperienceYears?: number | null
  requiredSkills?: string[]
  preferredSkills?: string[]
  education?: string
  location?: string
  onsiteRequired?: boolean
  knockoutCriteria?: Array<{ type: string; value: string; isHard: boolean; label: string }>
  interviewRubrics?: Array<{ skillName: string; description?: string }>
  screeningQuestions?: string[]
}

async function resolveDepartmentId(name: string | undefined): Promise<string | null> {
  if (!name) return null
  const dept = await prisma.department.findFirst({
    where: { name: { contains: name, mode: 'insensitive' } },
    select: { id: true },
  })
  return dept?.id ?? null
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { jds } = body as { jds: ParsedJD[] }
    if (!jds || !Array.isArray(jds) || jds.length === 0) {
      return NextResponse.json({ error: 'No JDs provided' }, { status: 400 })
    }

    const results: Array<{ title: string; requisitionId?: string; status: 'created' | 'error'; error?: string }> = []

    for (const jd of jds) {
      try {
        if (!jd.title || jd.title.trim().length < 2) {
          results.push({ title: jd.title || 'Untitled', status: 'error', error: 'Missing job title' })
          continue
        }

        const departmentId = await resolveDepartmentId(jd.department)
        const lines: string[] = []
        lines.push('# ' + jd.title)
        if (jd.department) lines.push('**Department:** ' + jd.department)
        if (jd.positionLevel) lines.push('**Level:** ' + jd.positionLevel.replace(/_/g, ' '))
        if (jd.type) lines.push('**Type:** ' + jd.type.replace(/_/g, ' '))
        if (jd.location) lines.push('**Location:** ' + jd.location)
        lines.push('')
        if (jd.description) { lines.push('## About the Role'); lines.push(jd.description); lines.push('') }
        if (jd.requirements) { lines.push('## Requirements'); lines.push(jd.requirements); lines.push('') }
        if (jd.requiredSkills && jd.requiredSkills.length > 0) {
          lines.push('## Required Skills')
          for (const skill of jd.requiredSkills) lines.push('- ' + skill)
          lines.push('')
        }
        if (jd.preferredSkills && jd.preferredSkills.length > 0) {
          lines.push('## Preferred Skills')
          for (const skill of jd.preferredSkills) lines.push('- ' + skill)
          lines.push('')
        }
        if (jd.minExperienceYears != null) lines.push('**Experience:** ' + jd.minExperienceYears + '+ years')
        if (jd.education) lines.push('**Education:** ' + jd.education.replace(/_/g, ' '))
        if (jd.salaryMin != null || jd.salaryMax != null) {
          const currency = jd.salaryCurrency || 'PKR'
          if (jd.salaryMin != null && jd.salaryMax != null) {
            lines.push('**Salary Range:** ' + currency + ' ' + jd.salaryMin.toLocaleString() + ' - ' + jd.salaryMax.toLocaleString())
          } else if (jd.salaryMin != null) {
            lines.push('**Salary:** From ' + currency + ' ' + jd.salaryMin.toLocaleString())
          }
        }
        if (jd.screeningQuestions && jd.screeningQuestions.length > 0) {
          lines.push('')
          lines.push('## Screening Questions')
          for (let i = 0; i < jd.screeningQuestions.length; i++) lines.push((i + 1) + '. ' + jd.screeningQuestions[i])
        }
        const jdMarkdown = lines.join('\n')

        const requisition = await prisma.jobRequisition.create({
          data: {
            title: jd.title.trim(),
            departmentId,
            positionLevel: jd.positionLevel || 'MID_LEVEL',
            type: jd.type || 'FULL_TIME',
            vacancies: jd.vacancies || 1,
            description: jd.description || null,
            requirements: jd.requirements || null,
            salaryMin: jd.salaryMin ?? null,
            salaryMax: jd.salaryMax ?? null,
            status: 'OPEN',
            requestedById: payload.employeeId || null,
            jdContent: jdMarkdown,
            jdStatus: 'JD_APPROVED',
            jdGeneratedAt: new Date(),
            jdApprovedAt: new Date(),
            jdApprovedById: payload.userId,
            scoreThreshold: 60,
          },
        })

        if (jd.knockoutCriteria && Array.isArray(jd.knockoutCriteria)) {
          await prisma.knockoutCriterion.createMany({
            data: jd.knockoutCriteria.map((kc) => ({
              requisitionId: requisition.id,
              type: kc.type,
              value: kc.value,
              isHard: kc.isHard,
            })),
          })
        }

        if (jd.interviewRubrics && Array.isArray(jd.interviewRubrics)) {
          await prisma.interviewRubric.createMany({
            data: jd.interviewRubrics.map((r) => ({
              requisitionId: requisition.id,
              skillName: r.skillName,
              // Required on InterviewRubric. The extractor doesn't classify the
              // skill, so default to TECHNICAL rather than dropping the rubric.
              skillCategory: 'TECHNICAL',
              description: r.description || null,
            })),
          })
        }

        results.push({ title: jd.title, requisitionId: requisition.id, status: 'created' })
      } catch (err) {
        console.error('[bulk-jd confirm] Error for "' + jd.title + '":', err)
        results.push({ title: jd.title || 'Untitled', status: 'error', error: err instanceof Error ? err.message : 'Failed' })
      }
    }

    return NextResponse.json({
      total: results.length,
      created: results.filter((r) => r.status === 'created').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    })
  } catch (error) {
    console.error('[bulk-jd confirm]', error)
    return NextResponse.json({ error: 'Failed to create requisitions' }, { status: 500 })
  }
}
