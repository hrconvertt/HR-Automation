/**
 * Training & Development.
 *
 * Three things HR actually does: run programs, put people on them and track how
 * far they got, and keep a register of the certifications people hold — with an
 * eye on the ones about to expire. Read here on the server; the doing is in the
 * client.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LearningClient } from './learning-client'
import { MyLearning, type LearningView, type CourseCard, type TranscriptRow } from './_components/my-learning'
import { parseLessons, parseQuiz, PROGRAM_TYPES } from '@/lib/learning'
import type { PathSummary } from '@/lib/learning-path-types'
import type { TeamRow } from './_components/team-view'
import { DEPARTED_STATUSES } from '@/lib/learning-assign'

/**
 * The required learning of the people who report to you, for My Team's
 * Learning. An ordinary function, so the clock is not read during render.
 */
async function loadTeam(empId: string | null): Promise<TeamRow[]> {
  if (!empId) return []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const rows = await prisma.trainingRecord.findMany({
    where: {
      required: true,
      employee: { reportingManagerId: empId, deletedAt: null, status: { notIn: DEPARTED_STATUSES } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    include: {
      employee: { select: { id: true, fullName: true } },
      program: { select: { id: true, title: true, type: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee.id,
    employeeName: r.employee.fullName,
    programId: r.program.id,
    title: r.program.title,
    type: r.program.type,
    status: r.status,
    score: r.score,
    dueDate: r.dueDate?.toISOString() ?? null,
    overdue: !!r.dueDate && r.dueDate < today && r.status !== 'COMPLETED',
  }))
}

export default async function LearningPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; topic?: string }>
}) {
  const sp = (await searchParams) ?? {}
  // My Learning is the front door for everyone now. The three management views
  // are still here, one tab away, exactly as they were.
  const MY_VIEWS: LearningView[] = ['my', 'discover', 'transcript', 'library', 'paths', 'team']
  const view: LearningView | null = MY_VIEWS.includes(sp.tab as LearningView)
    ? (sp.tab as LearningView)
    : sp.tab === 'programs' || sp.tab === 'records' || sp.tab === 'certs'
      ? null
      : 'my'
  const tab = sp.tab === 'records' || sp.tab === 'certs' ? sp.tab : 'programs'
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  const isHR = role === 'HR_ADMIN'

  if (view) {
    // Everything below is the signed-in person's own. A sign-in with no
    // employee record can still browse; the id below matches nothing, so the
    // queries return empty rather than branching.
    const empId = payload.employeeId ?? null
    const none = '__no-employee__'
    const [catalogue, mine, saves, me, pathRows, teamRows] = await Promise.all([
      prisma.trainingProgram.findMany({
        orderBy: [{ type: 'asc' }, { title: 'asc' }],
        select: {
          id: true, title: true, type: true, description: true,
          duration: true, provider: true, lessons: true, quiz: true,
        },
      }),
      prisma.trainingRecord.findMany({
        where: { employeeId: empId ?? none },
        orderBy: { createdAt: 'desc' },
        include: { program: { select: { title: true, type: true } } },
      }),
      prisma.learningSave.findMany({
        where: { employeeId: empId ?? none },
        select: { programId: true },
      }),
      prisma.employee.findUnique({ where: { id: empId ?? none }, select: { fullName: true } }),
      // Your own paths, and the ones other people set to Everyone.
      prisma.learningPath.findMany({
        where: { OR: [{ ownerId: empId ?? none }, { visibility: 'EVERYONE' }] },
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: { fullName: true } },
          _count: { select: { items: true } },
          items: {
            orderBy: { position: 'asc' },
            take: 3,
            include: { program: { select: { id: true, title: true, type: true } } },
          },
        },
      }),
      loadTeam(empId),
    ])

    // One status per course — the newest record wins if there are several.
    const latest = new Map<string, (typeof mine)[number]>()
    for (const r of mine) if (!latest.has(r.programId)) latest.set(r.programId, r)
    const saved = new Set(saves.map((s) => s.programId))

    const courses: CourseCard[] = catalogue.map((p) => {
      const r = latest.get(p.id)
      return {
        id: p.id,
        title: p.title,
        type: p.type,
        description: p.description,
        duration: p.duration,
        provider: p.provider,
        hasContent: parseLessons(p.lessons).length > 0 || parseQuiz(p.quiz).length > 0,
        myStatus: (r?.status as CourseCard['myStatus']) ?? null,
        myScore: r?.score ?? null,
        saved: saved.has(p.id),
      }
    })
    const transcript: TranscriptRow[] = mine.map((r) => ({
      id: r.id,
      programId: r.programId,
      title: r.program.title,
      type: r.program.type,
      status: r.status,
      score: r.score,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate?.toISOString() ?? null,
    }))
    const topic = (PROGRAM_TYPES as readonly string[]).includes(sp.topic ?? '') ? sp.topic! : null

    const paths: PathSummary[] = pathRows.map((p) => ({
      id: p.id,
      title: p.title,
      visibility: p.visibility,
      items: p._count.items,
      mine: p.ownerId === empId,
      owner: p.ownerId === empId ? null : p.owner.fullName,
      covers: p.items.map((i) => ({ id: i.program.id, title: i.program.title, type: i.program.type })),
    }))

    // Keyed so a new tab or topic mounts fresh state from fresh data, rather
    // than a Discover filter carrying over from wherever you came from.
    return (
      <MyLearning
        key={`${view}-${topic ?? ''}`}
        view={view}
        courses={courses}
        transcript={transcript}
        linked={!!empId}
        firstName={me?.fullName.split(' ')[0] ?? null}
        topic={topic}
        paths={paths}
        team={teamRows}
      />
    )
  }

  const [programs, records, certs, staff] = await Promise.all([
    prisma.trainingProgram.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { records: true } } },
    }),
    prisma.trainingRecord.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
        program: { select: { title: true, type: true } },
      },
    }),
    prisma.certification.findMany({ orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }] }),
    prisma.employee.findMany({
      where: { deletedAt: null, status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'] } },
      select: { id: true, fullName: true, employeeCode: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  // Certifications carry only employeeId, so resolve names here.
  const nameById = new Map(staff.map((s) => [s.id, s.fullName]))

  return (
    <LearningClient
      isHR={isHR}
      tab={tab}
      staff={staff}
      programs={programs.map((p) => ({
        id: p.id, title: p.title, type: p.type, provider: p.provider,
        description: p.description, duration: p.duration, cost: p.cost,
        enrolled: p._count.records,
      }))}
      records={records.map((r) => ({
        id: r.id,
        employeeName: r.employee.fullName,
        employeeCode: r.employee.employeeCode,
        programTitle: r.program.title,
        programType: r.program.type,
        status: r.status,
        score: r.score,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate?.toISOString() ?? null,
      }))}
      certs={certs.map((c) => ({
        id: c.id,
        employeeName: nameById.get(c.employeeId) ?? 'Unknown',
        name: c.name,
        issuedBy: c.issuedBy,
        issuedDate: c.issuedDate.toISOString(),
        expiryDate: c.expiryDate?.toISOString() ?? null,
        credentialUrl: c.credentialUrl,
      }))}
    />
  )
}
