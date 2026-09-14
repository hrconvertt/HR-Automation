/**
 * Help Center on the server — what somebody may read, and who may see a case.
 *
 * Find Answers lists three kinds of thing as one: articles HR writes, the
 * company policies the reader's role can see, and the in-app guides for
 * their role. Policies and guides are not copied into the articles table;
 * they are read where they already live, so an edited policy is never stale
 * in the Help Center.
 *
 * Cases are private. The person a case is for, whoever raised it, and HR see
 * it — not the person's manager, because a case can be a concern about that
 * manager. Executives get the Case Management counts, never the contents.
 */
import { prisma } from '@/lib/prisma'
import { guidesForRole } from '@/lib/help/guides'
import { canSeePolicy } from '@/lib/policy-access'
import type { TalentAccess } from '@/lib/talent'
import { articleCategoryLabel, caseTypeOf, caseLabel, type FeedbackRef } from '@/lib/help-center'
import { notify, notifyMany } from '@/lib/notifications'

export interface KnowledgeEntry {
  kind: FeedbackRef
  id: string
  href: string
  title: string
  summary: string
  category: string
  categoryLabel: string
  tags: string[]
  updatedAt: string | null
}

const POLICY_CATEGORY_TAG: Record<string, string> = {
  LEAVE: 'leave',
  CODE_OF_CONDUCT: 'code of conduct',
  IT: 'it',
  SECURITY: 'security',
  COMPENSATION: 'compensation',
  GENERAL: 'general',
}

export async function knowledgeFor(role: string): Promise<KnowledgeEntry[]> {
  const [articles, policies] = await Promise.all([
    prisma.helpArticle.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, summary: true, body: true, category: true, tags: true, audienceRoles: true, updatedAt: true },
    }),
    prisma.policyDocument.findMany({
      where: { status: { in: ['ACTIVE', 'PUBLISHED'] } },
      orderBy: { title: 'asc' },
      select: {
        id: true, title: true, description: true, content: true, category: true, type: true,
        status: true, audience: true, audienceRoles: true, publishedAt: true, effectiveDate: true,
      },
    }),
  ])

  const out: KnowledgeEntry[] = []
  for (const a of articles) {
    if (role !== 'HR_ADMIN' && a.audienceRoles.length > 0 && !a.audienceRoles.includes(role)) continue
    out.push({
      kind: 'ARTICLE',
      id: a.id,
      href: `/dashboard/help/articles/${a.id}`,
      title: a.title,
      summary: a.summary || plain(a.body),
      category: a.category,
      categoryLabel: articleCategoryLabel(a.category),
      tags: a.tags,
      updatedAt: a.updatedAt.toISOString(),
    })
  }
  for (const p of policies) {
    if (!canSeePolicy(p, role)) continue
    out.push({
      kind: 'POLICY',
      id: p.id,
      href: `/dashboard/policies/${p.id}`,
      title: p.title,
      summary: p.description || plain(p.content ?? ''),
      category: 'POLICIES',
      categoryLabel: articleCategoryLabel('POLICIES'),
      tags: ['policy', POLICY_CATEGORY_TAG[p.category] ?? p.category.toLowerCase()],
      updatedAt: (p.publishedAt ?? p.effectiveDate)?.toISOString() ?? null,
    })
  }
  for (const g of guidesForRole(role)) {
    out.push({
      kind: 'GUIDE',
      id: g.slug,
      href: `/dashboard/help/${g.slug}`,
      title: g.title,
      summary: g.description.replace(/&amp;/g, '&'),
      category: 'USING_THE_APP',
      categoryLabel: articleCategoryLabel('USING_THE_APP'),
      tags: ['how to', g.slug.replace(/-/g, ' ')],
      updatedAt: null,
    })
  }
  return out
}

/** Markdown down to one plain line, for a summary. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

/** Title matches weigh most, then tags, then the summary. */
export function searchKnowledge(entries: KnowledgeEntry[], q: string): KnowledgeEntry[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (words.length === 0) return []
  return entries
    .map((e) => {
      const title = e.title.toLowerCase()
      const tags = e.tags.join(' ').toLowerCase()
      const summary = e.summary.toLowerCase()
      let score = 0
      for (const w of words) {
        if (title.includes(w)) score += 3
        if (tags.includes(w)) score += 2
        if (summary.includes(w)) score += 1
      }
      return { e, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e)
}

export function relatedTo(entries: KnowledgeEntry[], self: { kind: string; id: string; category: string; tags: string[] }, limit = 3) {
  const mine = new Set(self.tags.map((t) => t.toLowerCase()))
  return entries
    .filter((e) => !(e.kind === self.kind && e.id === self.id))
    .map((e) => ({
      e,
      score: (e.category === self.category ? 2 : 0) + e.tags.filter((t) => mine.has(t.toLowerCase())).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e)
}

// ─── Cases ───────────────────────────────────────────────────────────────────

/** HR working cases — the real HR role, not previewing another. */
export function isCaseAgent(v: TalentAccess): boolean {
  return v.actualRole === 'HR_ADMIN' && !v.isPreviewMode
}

/** HR (including an HR admin previewing HR) reads every case. */
export function seesAllCases(v: TalentAccess): boolean {
  return v.effectiveRole === 'HR_ADMIN'
}

export function canSeeCase(v: TalentAccess, t: { employeeId: string; createdById: string | null }): boolean {
  if (seesAllCases(v)) return true
  return (!!v.employeeId && t.employeeId === v.employeeId) || t.createdById === v.userId
}

export function caseScope(v: TalentAccess) {
  if (seesAllCases(v)) return {}
  return { OR: [{ employeeId: v.employeeId ?? '__none__' }, { createdById: v.userId }] }
}

/** Who a case may be raised for: HR anyone, a manager themselves or a direct report, anyone else themselves. */
export async function canCreateFor(v: TalentAccess, employeeId: string): Promise<boolean> {
  if (v.isPreviewMode) return false
  if (v.actualRole === 'HR_ADMIN') return true
  if (v.employeeId === employeeId) return true
  if (v.effectiveRole !== 'MANAGER' || !v.employeeId) return false
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { reportingManagerId: true } })
  return e?.reportingManagerId === v.employeeId
}

export async function hrAdminEmployeeIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { role: 'HR_ADMIN' },
    select: { employee: { select: { id: true, status: true } } },
  })
  return users.map((u) => u.employee).filter((e): e is { id: string; status: string } => !!e && e.status === 'ACTIVE').map((e) => e.id)
}

export async function createCase(opts: {
  forEmployeeId: string
  createdByUserId: string
  createdByEmployeeId: string | null
  createdByName: string
  type: string
  title: string
  description: string
  priority?: string
  attachment?: { bytes: Buffer; mime: string; name: string } | null
}) {
  const type = caseTypeOf(opts.type)
  let created: { id: string; caseNumber: number | null } | null = null
  for (let attempt = 0; attempt < 4 && !created; attempt++) {
    const agg = await prisma.helpDeskTicket.aggregate({ _max: { caseNumber: true } })
    const caseNumber = (agg._max.caseNumber ?? 0) + 1
    try {
      created = await prisma.helpDeskTicket.create({
        data: {
          caseNumber,
          employeeId: opts.forEmployeeId,
          createdById: opts.createdByUserId,
          category: type.value,
          serviceTeam: type.team,
          subject: opts.title,
          description: opts.description,
          priority: opts.priority ?? 'MEDIUM',
          status: 'OPEN',
          attachmentName: opts.attachment?.name ?? null,
          attachmentMime: opts.attachment?.mime ?? null,
          attachmentBytes: opts.attachment?.bytes ?? null,
        },
        select: { id: true, caseNumber: true },
      })
    } catch (err) {
      // Two cases created at once can take the same number; take the next one.
      if ((err as { code?: string }).code !== 'P2002') throw err
    }
  }
  if (!created) throw new Error('Could not assign a case number')

  const label = caseLabel(created.caseNumber, created.id)
  const link = `/dashboard/help/cases/${created.id}`
  const hr = (await hrAdminEmployeeIds()).filter((id) => id !== opts.createdByEmployeeId)
  await Promise.all([
    hr.length
      ? notifyMany(hr, {
          type: 'GENERAL',
          title: `New case ${label}`,
          message: `${opts.createdByName}: ${opts.title} · ${type.label}`,
          link,
        })
      : Promise.resolve(),
    opts.forEmployeeId !== opts.createdByEmployeeId
      ? notify({
          employeeId: opts.forEmployeeId,
          type: 'GENERAL',
          title: `Case ${label} opened for you`,
          message: `${opts.createdByName} opened “${opts.title}”. You will be told about every update.`,
          link,
        })
      : Promise.resolve(),
  ])
  return { ...created, label }
}
