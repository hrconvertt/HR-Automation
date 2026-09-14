/**
 * Help Center articles.
 *
 *   GET  ?q=&cat=   what the reader can see — articles, policies and guides —
 *                   searched by q, or listed for a category. Used by Create
 *                   Case for its suggested resources.
 *   POST            write an article (HR)
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveTalentAccess, cleanText } from '@/lib/talent'
import { knowledgeFor, searchKnowledge } from '@/lib/help-center-server'
import { ARTICLE_CATEGORY_KEYS, ARTICLE_STATUSES, ARTICLE_AUDIENCE_ROLES } from '@/lib/help-center'

export async function GET(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const cat = request.nextUrl.searchParams.get('cat') ?? ''
  const entries = await knowledgeFor(access.effectiveRole)
  let list = q ? searchKnowledge(entries, q) : []
  if (list.length < 4 && cat) {
    const seen = new Set(list.map((e) => `${e.kind}:${e.id}`))
    list = [...list, ...entries.filter((e) => e.category === cat && !seen.has(`${e.kind}:${e.id}`))]
  }
  if (!q && !cat) list = entries
  return NextResponse.json({ entries: list.slice(0, 8) })
}

export function articleInput(body: Record<string, unknown>) {
  const title = cleanText(body.title, 160)
  const bodyText = typeof body.body === 'string' ? body.body.trim().slice(0, 50_000) : ''
  const category = typeof body.category === 'string' && ARTICLE_CATEGORY_KEYS.includes(body.category) ? body.category : null
  if (!title || !bodyText || !category) return { error: 'Give the article a title, a category and a body.' } as const
  const status = typeof body.status === 'string' && (ARTICLE_STATUSES as readonly string[]).includes(body.status) ? body.status : 'DRAFT'
  const tags = Array.isArray(body.tags)
    ? [...new Set(body.tags.map((t) => cleanText(t, 40)?.toLowerCase()).filter((t): t is string => !!t))].slice(0, 15)
    : []
  const audienceRoles = Array.isArray(body.audienceRoles)
    ? body.audienceRoles.filter((r): r is string => typeof r === 'string' && (ARTICLE_AUDIENCE_ROLES as readonly string[]).includes(r))
    : []
  return { data: { title, body: bodyText, category, status, tags, audienceRoles, summary: cleanText(body.summary, 300) } } as const
}

export async function POST(request: NextRequest) {
  const access = await resolveTalentAccess(request)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.actualRole !== 'HR_ADMIN' || access.isPreviewMode) {
    return NextResponse.json({ error: 'Only HR writes Help Center articles.' }, { status: 403 })
  }
  const parsed = articleInput((await request.json().catch(() => ({}))) as Record<string, unknown>)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const article = await prisma.helpArticle.create({
    data: { ...parsed.data, createdById: access.userId, updatedById: access.userId },
    select: { id: true },
  })
  return NextResponse.json({ article }, { status: 201 })
}
