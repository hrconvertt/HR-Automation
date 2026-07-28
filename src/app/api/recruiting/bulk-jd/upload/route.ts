import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { ZAI } from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'

const JD_EXTRACTION_PROMPT = `You are an expert HR data extractor. I will give you the raw text of a Job Description document. Extract ALL information into a precise JSON object.

Return ONLY valid JSON (no markdown, no explanation). Use this exact schema:

{
  "title": "Job title exactly as written",
  "department": "Department name (e.g., Marketing, Engineering, Finance, HR, Design, Sales, Operations, IT)",
  "positionLevel": "INTERN | JUNIOR | MID_LEVEL | SENIOR | LEAD | MANAGER | DIRECTOR | VP | C_LEVEL",
  "type": "FULL_TIME | PART_TIME | INTERNSHIP | TRAINEE | CONTRACT",
  "vacancies": 1,
  "description": "Full job description summary (2-3 paragraphs)",
  "requirements": "Detailed requirements text as written in the JD",
  "salaryMin": null,
  "salaryMax": null,
  "salaryCurrency": "PKR | USD | AED | GBP",
  "minExperienceYears": null,
  "maxExperienceYears": null,
  "requiredSkills": ["skill1", "skill2"],
  "preferredSkills": ["skill1", "skill2"],
  "education": "BACHELORS | MASTERS | PHD | DIPLOMA | HIGH_SCHOOL | ANY",
  "educationField": "e.g., Computer Science, Business, Marketing",
  "location": "City, Country",
  "onsiteRequired": true,
  "immediateJoinPreferred": false,
  "easyCommuteRequired": false,
  "communicationRequired": "GOOD | FLUENT | NATIVE | ANY",
  "keyResponsibilities": ["responsibility1", "responsibility2"],
  "knockoutCriteria": [
    {"type": "MIN_YEARS", "value": "2", "isHard": true, "label": "Minimum 2 years experience"},
    {"type": "SKILL", "value": "Shopify Liquid", "isHard": true, "label": "Must know Shopify Liquid"},
    {"type": "LOCATION", "value": "Lahore", "isHard": true, "label": "Must be in Lahore"}
  ],
  "interviewRubrics": [
    {"skillName": "Technical Assessment", "description": "Test core technical skills"}
  ],
  "screeningQuestions": [
    "Question 1 for initial phone screen",
    "Question 2 for initial phone screen"
  ]
}

RULES:
- If salary is mentioned as a range, extract both min and max.
- If salary says Competitive or Market rate, leave null.
- Detect currency from context (PKR for Pakistani companies, USD for US, etc.)
- Generate 3-6 knockout criteria based on the JD MUST-HAVE requirements.
- Required skills = explicit must have / required skills.
- Preferred skills = nice to have / bonus / preferred skills.
- Generate 2-4 screening questions for a first call.
- Generate 1-3 interview rubric areas.
- For internships, set minExperienceYears to 0 and type to INTERNSHIP.
- If JD mentions onsite or office-based, set onsiteRequired to true.
`

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

async function parseJDWithAI(rawText: string): Promise<Record<string, unknown>> {
  const zai = await ZAI.create()
  const response = await zai.chat.completions.create({
    model: 'glm-4-flash',
    messages: [
      { role: 'system', content: JD_EXTRACTION_PROMPT },
      { role: 'user', content: rawText.length > 12000 ? rawText.slice(0, 12000) + '\n[TRUNCATED]' : rawText },
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
    throw new Error('Failed to parse AI response as JSON')
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('hr_token')?.value
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const files = formData.getAll('files')
    if (!files || files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    if (files.length > 20) return NextResponse.json({ error: 'Maximum 20 files per upload' }, { status: 400 })

    const results: Array<{ filename: string; status: 'success' | 'error'; jd?: Record<string, unknown>; rawText?: string; error?: string }> = []

    for (const file of files) {
      const filename = (file as File).name
      try {
        const buffer = Buffer.from(await (file as File).arrayBuffer())
        if (buffer.length > 10 * 1024 * 1024) {
          results.push({ filename, status: 'error', error: 'File too large (max 10MB)' })
          continue
        }
        const rawText = await extractTextFromBuffer(buffer, filename)
        if (!rawText || rawText.trim().length < 50) {
          results.push({ filename, status: 'error', error: 'Could not extract meaningful text' })
          continue
        }
        const jd = await parseJDWithAI(rawText)
        jd.rawText = rawText
        jd.sourceFile = filename
        jd.parsedAt = new Date().toISOString()
        results.push({ filename, status: 'success', jd, rawText })
      } catch (err) {
        console.error('[bulk-jd] Error processing ' + filename + ':', err)
        results.push({ filename, status: 'error', error: err instanceof Error ? err.message : 'Failed to process file' })
      }
    }

    return NextResponse.json({
      total: results.length,
      success: results.filter((r) => r.status === 'success').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    })
  } catch (error) {
    console.error('[bulk-jd upload]', error)
    return NextResponse.json({ error: 'Failed to process JD files' }, { status: 500 })
  }
}
