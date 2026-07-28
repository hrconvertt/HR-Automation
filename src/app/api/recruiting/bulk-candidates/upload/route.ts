import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ZAI } from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'

const RESUME_EXTRACTION_PROMPT = `You are an expert resume analyzer. I give you a JOB DESCRIPTION and a RESUME. Extract candidate info AND evaluate against the job. Return ONLY valid JSON.

Schema:
{
  "fullName": "Full name",
  "email": "email@example.com",
  "phone": "+92 300 0000000",
  "location": "City, Country",
  "currentCompany": "Current company or null",
  "currentRole": "Current job title or null",
  "totalExperienceYears": 3.5,
  "education": "BACHELORS | MASTERS | PHD | DIPLOMA | HIGH_SCHOOL",
  "educationField": "e.g., Computer Science",
  "skills": ["skill1", "skill2"],
  "matchScore": 75,
  "scoreBreakdown": {
    "experienceMatch": 8,
    "skillsMatch": 9,
    "educationMatch": 7,
    "locationMatch": 5,
    "overallNotes": "Summary of fit"
  },
  "knockoutEvaluation": {
    "passed": true,
    "failures": [],
    "details": "Evaluation details"
  },
  "recommendation": "STRONG_MATCH | MATCH | POSSIBLE | WEAK | REJECT",
  "summary": "2-3 sentence summary"
}

SCORING: 90-100=Exceptional, 70-89=Strong, 50-69=Possible, 30-49=Weak, 0-29=Poor.
If candidate fails ANY hard knockout (location, min experience, required skill, education, onsite), set passed=false.`

async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'txt' || ext === 'md') return buffer.toString('utf-8')
  if (ext === 'pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)
    return data.text
  }
  if (ext === 'docx') {
    const text = buffer.toString('utf-8')
    const matches = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)
    if (matches) return matches.map((m: string) => m.replace(/<\/?w:t[^>]*>/g, '')).join(' ')
    return text
  }
  return buffer.toString('utf-8')
}

async function scoreCandidateWithAI(resumeText: string, jdContent: string): Promise<Record<string, unknown>> {
  const zai = await ZAI.create()
  const jdCtx = jdContent.length > 4000 ? jdContent.slice(0, 4000) + '\n[TRUNCATED]' : jdContent
  const resCtx = resumeText.length > 8000 ? resumeText.slice(0, 8000) + '\n[TRUNCATED]' : resumeText

  const response = await zai.chat.completions.create({
    model: 'glm-4-flash',
    messages: [
      { role: 'system', content: RESUME_EXTRACTION_PROMPT },
      { role: 'user', content: '=== JOB DESCRIPTION ===\n' + jdCtx + '\n\n=== CANDIDATE RESUME ===\n' + resCtx },
    ],
    temperature: 0.1,
  })

  const content = response.choices[0]?.message?.content ?? ''
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/)
  const jsonStr = jsonMatch ? jsonMatch[1] : content
  try {
    return JSON.parse(jsonStr.trim())
  } catch {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1))
    throw new Error('Failed to parse AI response')
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const requisitionId = formData.get('requisitionId') as string | null

    if (!requisitionId) return NextResponse.json({ error: 'requisitionId is required' }, { status: 400 })
    if (!files || files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

    const requisition = await prisma.jobRequisition.findUnique({
      where: { id: requisitionId },
      include: { knockoutCriteria: true },
    })
    if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

    const jdText = requisition.jdContent || requisition.description || requisition.requirements || 'Title: ' + requisition.title

    const results: Array<{ filename: string; status: 'success' | 'error'; candidate?: Record<string, unknown>; error?: string }> = []
    const strongIds: string[] = []

    for (const file of files) {
      const filename = file.name
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        if (buffer.length > 10 * 1024 * 1024) {
          results.push({ filename, status: 'error', error: 'File too large (max 10MB)' })
          continue
        }

        const rawText = await extractTextFromBuffer(buffer, filename)
        if (!rawText || rawText.trim().length < 30) {
          results.push({ filename, status: 'error', error: 'Could not extract text' })
          continue
        }

        const parsed = await scoreCandidateWithAI(rawText, jdText)
        const knockoutEval = parsed.knockoutEvaluation as { passed?: boolean; failures?: string[] } | undefined
        const knockoutStatus = knockoutEval?.passed === false ? 'FAILED' : 'PASSED'
        const knockoutReasons = knockoutEval?.failures?.length
          ? JSON.stringify(knockoutEval.failures.map((f: string) => ({ type: 'AUTO_SCREEN', reason: f })))
          : null

        const matchScore = typeof parsed.matchScore === 'number' ? parsed.matchScore : null
        const breakdown = parsed.scoreBreakdown as Record<string, unknown> | undefined
        const scoreReason = breakdown?.overallNotes
          ? JSON.stringify({ recommendation: parsed.recommendation, notes: breakdown.overallNotes, summary: parsed.summary })
          : null

        const candidate = await prisma.candidate.create({
          data: {
            requisitionId,
            fullName: parsed.fullName || filename.replace(/\.[^.]+$/, ''),
            email: parsed.email || 'unknown-' + Date.now() + '@no-email.com',
            phone: parsed.phone || null,
            currentCompany: parsed.currentCompany || null,
            currentRole: parsed.currentRole || null,
            experience: parsed.totalExperienceYears || null,
            location: parsed.location || null,
            stage: matchScore && matchScore >= 70 ? 'SCREENING' : 'APPLIED',
            source: 'BULK_UPLOAD',
            matchScore,
            scoreReason,
            knockoutStatus,
            knockoutReasons,
            yearsExperience: parsed.totalExperienceYears ? Math.floor(parsed.totalExperienceYears) : null,
            educationLevel: parsed.education || null,
            skills: parsed.skills ? JSON.stringify(parsed.skills) : null,
            notes: parsed.summary || null,
            cvUrl: filename,
          },
        })

        results.push({ filename, status: 'success', candidate: { id: candidate.id, ...parsed, knockoutStatus } })

        if (matchScore != null && matchScore >= 60) strongIds.push(candidate.id)
      } catch (err) {
        console.error('[bulk-candidates] Error processing ' + filename + ':', err)
        results.push({ filename, status: 'error', error: err instanceof Error ? err.message : 'Failed' })
      }
    }

    // Auto-add strong candidates to talent pool
    if (strongIds.length > 0) {
      await prisma.candidate.updateMany({
        where: { id: { in: strongIds } },
        data: { inTalentPool: true, poolAddedAt: new Date(), poolReason: 'Auto-added: score >= 60 from bulk upload' },
      })
    }

    return NextResponse.json({
      total: results.length,
      success: results.filter((r) => r.status === 'success').length,
      errors: results.filter((r) => r.status === 'error').length,
      autoTalentPool: strongIds.length,
      results,
    })
  } catch (error) {
    console.error('[bulk-candidates upload]', error)
    return NextResponse.json({ error: 'Failed to process resumes' }, { status: 500 })
  }
}
