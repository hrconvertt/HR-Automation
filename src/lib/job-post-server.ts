/**
 * Server half of the job post editor: who may work on a job, reading the job
 * fields out of a request, and the two side effects publishing and submitting
 * have — the careers-page advert and HR's notification.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { trackingToken } from '@/lib/job-posting'
import {
  EDUCATION_LEVELS, EMPLOYMENT_TYPES, LEVELS, SALARY_CURRENCIES,
  sanitizeApplicationFields, sanitizeSections,
  type ApplicationFieldKey, type FieldMode, type JdSections,
} from '@/lib/job-post'

export interface JobActor {
  userId: string
  role: string
  employeeId: string | null
  isHR: boolean
}

/** HR, or a manager. Preview mode acts as the previewed role, as elsewhere. */
export async function resolveJobActor(request: NextRequest): Promise<JobActor | NextResponse> {
  const payload = await verifyToken(request.cookies.get('hr_token')?.value)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const preview = request.cookies.get('hr_preview_role')?.value
  const role = preview && me.role === 'HR_ADMIN' ? preview : me.role
  if (role !== 'HR_ADMIN' && role !== 'MANAGER') {
    return NextResponse.json({ error: 'Only HR or hiring managers can work on job posts' }, { status: 403 })
  }
  return { userId: me.id, role, employeeId: me.employee?.id ?? null, isHR: role === 'HR_ADMIN' }
}

/**
 * HR edits any job. A manager edits the job they raised while it is still
 * theirs to write — a draft, or a request HR has not decided yet.
 */
export function canEditJob(actor: JobActor, req: { status: string; requestedById: string | null }): boolean {
  if (actor.isHR) return true
  return !!actor.employeeId
    && req.requestedById === actor.employeeId
    && (req.status === 'DRAFT' || req.status === 'PENDING')
}

export interface JobFields {
  title: string
  departmentId: string | null
  positionLevel: string | null
  type: string
  vacancies: number
  location: string | null
  isRemote: boolean
  internalCode: string | null
  minExperienceYears: number | null
  educationLevel: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string
  closingDate: Date | null
  sections: JdSections
}

function money(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function text(v: unknown, max: number): string | null {
  const s = String(v ?? '').trim().slice(0, max)
  return s || null
}

/** The first step's boxes, checked and coerced. */
export function readJobFields(input: unknown): { fields: JobFields } | { error: string } {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const title = String(o.title ?? '').trim().slice(0, 150)
  if (title.length < 2) return { error: 'Give the job a title.' }

  const salaryMin = money(o.salaryMin)
  const salaryMax = money(o.salaryMax)
  if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
    return { error: 'The salary "from" is higher than the "to".' }
  }
  const years = o.minExperienceYears == null || o.minExperienceYears === ''
    ? null
    : Math.max(0, Math.min(50, Math.round(Number(o.minExperienceYears) * 2) / 2 || 0))
  const closing = o.closingDate ? new Date(String(o.closingDate)) : null
  const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | null =>
    (list as readonly string[]).includes(String(v)) ? (String(v) as T[number]) : null

  return {
    fields: {
      title,
      departmentId: text(o.departmentId, 60),
      positionLevel: pick(LEVELS, o.positionLevel),
      type: pick(EMPLOYMENT_TYPES, o.type) ?? 'FULL_TIME',
      vacancies: Math.max(1, Math.min(100, Math.floor(Number(o.vacancies) || 1))),
      location: text(o.location, 120),
      isRemote: o.isRemote === true,
      internalCode: text(o.internalCode, 40),
      minExperienceYears: years || null,
      educationLevel: pick(EDUCATION_LEVELS, o.educationLevel),
      salaryMin,
      salaryMax,
      salaryCurrency: pick(SALARY_CURRENCIES, o.salaryCurrency) ?? 'PKR',
      closingDate: closing && !isNaN(closing.getTime()) ? closing : null,
      sections: sanitizeSections(o.sections),
    },
  }
}

// ─── "Keep this setup for my future jobs" ──────────────────────────────────

const DEFAULT_FORM_KEY = 'recruiting_default_application_form'

export async function readDefaultApplicationFields(): Promise<Record<ApplicationFieldKey, FieldMode>> {
  const row = await prisma.config.findUnique({ where: { key: DEFAULT_FORM_KEY } })
  let stored: unknown = null
  try { stored = row?.value ? JSON.parse(row.value) : null } catch { stored = null }
  return sanitizeApplicationFields(stored)
}

export async function saveDefaultApplicationFields(fields: Record<ApplicationFieldKey, FieldMode>) {
  const value = JSON.stringify(fields)
  await prisma.config.upsert({
    where: { key: DEFAULT_FORM_KEY },
    update: { value },
    create: { key: DEFAULT_FORM_KEY, value },
  })
}

// ─── Side effects ───────────────────────────────────────────────────────────

/**
 * Publishing puts the role on the public careers page, so that advert exists
 * and belongs on Job Post Payments. It is free; a re-publish reopens the same
 * row rather than stacking a second one.
 */
export async function openCareersPosting(requisitionId: string, userId: string, now = new Date()) {
  const existing = await prisma.jobPosting.findFirst({
    where: { requisitionId, platform: 'CAREERS_PAGE' },
    select: { id: true },
  })
  if (existing) {
    await prisma.jobPosting.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', closedAt: null },
    })
    return
  }
  await prisma.jobPosting.create({
    data: {
      requisitionId,
      platform: 'CAREERS_PAGE',
      trackingToken: trackingToken('CAREERS_PAGE', now),
      postedAt: now,
      budget: 0,
      cost: 0,
      currency: 'AED',
      status: 'ACTIVE',
      postedBy: userId,
      notes: 'Opened automatically when the JD was approved and published.',
    },
  })
}

/** Every HR admin hears about a manager's request the moment it is raised. */
export async function notifyHrOfHiringRequest(req: {
  id: string; title: string; vacancies: number; managerName: string | null
}) {
  const hrs = await prisma.user.findMany({
    where: { role: 'HR_ADMIN', employee: { isNot: null } },
    select: { employee: { select: { id: true } } },
  })
  await prisma.notification.createMany({
    data: hrs.filter((h) => h.employee).map((h) => ({
      employeeId: h.employee!.id,
      type: 'HIRING_REQUEST',
      title: `New hiring request — ${req.title}`,
      message: `${req.managerName ?? 'A manager'} requested ${req.vacancies} ${req.vacancies === 1 ? 'hire' : 'hires'} for "${req.title}"`,
      link: `/dashboard/recruiting?tab=requests&id=${req.id}`,
    })),
  })
}
