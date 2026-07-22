import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/recruiting/candidates/[id]/resume — trigger resume parse
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const candidate = await prisma.candidate.findUnique({
      where: { id },
      select: { cvUrl: true, notes: true, currentRole: true, currentCompany: true, fullName: true, experience: true, skills: true, educationLevel: true, languages: true },
    })
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })

    // Extract skills from candidate data
    const existingSkills: string[] = candidate.skills ? JSON.parse(candidate.skills) : []
    const existingLanguages: string[] = candidate.languages ? JSON.parse(candidate.languages) : []

    // Build education array
    const education = candidate.educationLevel ? [{
      degree: candidate.educationLevel,
      institution: 'Not specified',
      field: 'Not specified',
      year: null,
    }] : []

    // Build work history
    const workHistory = candidate.currentRole ? [{
      company: candidate.currentCompany || 'Not specified',
      role: candidate.currentRole,
      duration: `${candidate.experience || 0} years`,
      highlights: candidate.notes ? [candidate.notes.substring(0, 200)] : [],
    }] : []

    const parsedData = JSON.stringify({
      contact: { name: candidate.fullName, email: '' },
      skills: existingSkills,
      education,
      workHistory,
      certifications: [],
      languages: existingLanguages,
      summary: candidate.notes || '',
    })

    const resumeParse = await prisma.resumeParse.upsert({
      where: { candidateId: id },
      update: {
        parsedData,
        skills: JSON.stringify(existingSkills),
        education: JSON.stringify(education),
        workHistory: JSON.stringify(workHistory),
        languages: JSON.stringify(existingLanguages),
        totalExperience: candidate.experience ?? null,
        confidence: existingSkills.length > 0 ? 0.7 : 0.3,
        parserVersion: '1.0',
      },
      create: {
        candidateId: id,
        parsedData,
        skills: JSON.stringify(existingSkills),
        education: JSON.stringify(education),
        workHistory: JSON.stringify(workHistory),
        languages: JSON.stringify(existingLanguages),
        totalExperience: candidate.experience ?? null,
        confidence: existingSkills.length > 0 ? 0.7 : 0.3,
        parserVersion: '1.0',
      },
    })

    return NextResponse.json(resumeParse, { status: 201 })
  } catch (error) {
    console.error('[resume POST]', error)
    return NextResponse.json({ error: 'Failed to parse resume' }, { status: 500 })
  }
}