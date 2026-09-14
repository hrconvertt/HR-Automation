/**
 * The talent side of a worker profile, as Workday's profile draws it next to
 * Job Details: Skills (each opening its ratings), Start Job Change, and Job
 * History.
 *
 * Rendered inside the profile's overview grid, so it returns cards rather
 * than a wrapper.
 */
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { JOB_CHANGE_TYPE_LABEL, type JobChangeType } from '@/lib/job-changes'
import { SkillChips } from './skill-chips'
import { JobChangeButtons } from '@/app/dashboard/team-insights/_components/job-change-buttons'

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export async function ProfileTalentCards({ employeeId, active, canManage, canOpenTalent, joiningDate, hiringDesignation, designation }: {
  employeeId: string
  active: boolean
  /** HR or the direct manager — may start a job change. */
  canManage: boolean
  /** May open the Team Insights talent page for this person. */
  canOpenTalent: boolean
  joiningDate: Date
  hiringDesignation: string | null
  designation: string
}) {
  const [skills, ratings, jobChanges, roleHistory] = await Promise.all([
    prisma.employeeSkill.findMany({
      where: { employeeId },
      orderBy: [{ level: 'desc' }, { skill: { name: 'asc' } }],
      select: { level: true, skill: { select: { id: true, name: true } } },
    }),
    prisma.skillRating.groupBy({
      by: ['skillId'], where: { employeeId }, _avg: { rating: true },
    }),
    prisma.jobChange.findMany({
      where: { employeeId, status: 'ENACTED' },
      orderBy: { effectiveDate: 'desc' },
      select: { id: true, changeType: true, fromDesignation: true, toDesignation: true, effectiveDate: true },
    }),
    prisma.managerHistory.findMany({
      where: { employeeId, title: { not: null } },
      orderBy: { changedAt: 'desc' },
      select: { id: true, title: true, effectiveDate: true, changedAt: true, notes: true },
    }),
  ])
  const avgOf = new Map(ratings.map((r) => [r.skillId, r._avg.rating]))

  // One timeline: enacted job changes and HR's role-history entries, newest
  // first, ending where they joined.
  const history = [
    ...jobChanges.map((j) => ({
      id: j.id,
      title: j.toDesignation ?? (JOB_CHANGE_TYPE_LABEL[j.changeType as JobChangeType] ?? j.changeType),
      detail: `${JOB_CHANGE_TYPE_LABEL[j.changeType as JobChangeType] ?? j.changeType}${j.fromDesignation && j.toDesignation ? ` from ${j.fromDesignation}` : ''}`,
      at: j.effectiveDate,
    })),
    ...roleHistory.map((r) => ({
      id: r.id, title: r.title as string, detail: r.notes ?? 'Role history', at: r.effectiveDate ?? r.changedAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Skills</CardTitle>
            {canOpenTalent && (
              <Link href={`/dashboard/team-insights/${employeeId}?tab=development`}
                className="text-sm font-medium text-slate-900 underline underline-offset-2">
                Edit skills
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <SkillChips
            employeeId={employeeId}
            skills={skills.map((s) => ({
              skillId: s.skill.id,
              name: s.skill.name,
              level: s.level,
              average: avgOf.get(s.skill.id) != null ? Math.round((avgOf.get(s.skill.id) as number) * 10) / 10 : null,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Job History</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id}>
                <p className="text-sm font-medium text-slate-900">{h.title}</p>
                <p className="text-xs text-slate-500">{h.detail} · {day(h.at)}</p>
              </li>
            ))}
            <li>
              <p className="text-sm font-medium text-slate-900">{hiringDesignation || (history.length === 0 ? designation : 'Joined')}</p>
              <p className="text-xs text-slate-500">Joined Convertt · {day(joiningDate)}</p>
            </li>
          </ol>
        </CardContent>
      </Card>

      {canManage && active && (
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Start Job Change</CardTitle></CardHeader>
          <CardContent>
            <JobChangeButtons employeeId={employeeId} />
            <p className="text-[11px] text-slate-400 mt-2">Each opens a request on that type. HR approves it before anything changes.</p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
