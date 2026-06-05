/**
 * /careers/feed.xml — RSS 2.0 feed of open roles.
 *
 *   Compatible with: Webflow CMS, Squarespace, Framer, Sanity, RSS
 *   readers, Indeed (some plans accept feed-based indexing), and any
 *   generic "syndicate from RSS" plugin.
 */
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  } as Record<string, string>)[c])
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const jobs = await prisma.jobRequisition.findMany({
    where: { jdStatus: 'POSTED', status: 'OPEN' },
    select: {
      id: true, title: true, type: true, vacancies: true,
      jdApprovedAt: true, jdContent: true, departmentId: true,
    },
    orderBy: { jdApprovedAt: 'desc' },
  })
  const deptIds = Array.from(new Set(jobs.map((j) => j.departmentId).filter(Boolean) as string[]))
  const depts = deptIds.length
    ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })
    : []
  const deptName = new Map(depts.map((d) => [d.id, d.name]))

  const items = jobs.map((j) => {
    const url = `${baseUrl}/careers/${j.id}`
    const pubDate = (j.jdApprovedAt ?? new Date()).toUTCString()
    // Trim the markdown to a sensible description; full content is on the
    // detail page if the reader follows the link.
    const description = (j.jdContent ?? '').slice(0, 600).replace(/\n/g, ' ')
    const dept = j.departmentId ? deptName.get(j.departmentId) : null
    return `
    <item>
      <title>${esc(j.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${esc(description)}</description>
      <category>${esc(j.type)}</category>
      ${dept ? `<category>${esc(dept)}</category>` : ''}
    </item>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Convertt — Open Roles</title>
    <link>${esc(baseUrl)}/careers</link>
    <description>Currently hiring at Convertt.</description>
    <language>en</language>
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
