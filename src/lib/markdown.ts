/**
 * Tiny zero-dependency markdown → HTML renderer.
 *
 * Supports the subset we use in policy / help content:
 *   - # / ## / ### headings
 *   - **bold** and *italic*
 *   - Bullet lists (- and *)
 *   - Numbered lists (1. 2. 3.)
 *   - GitHub-style tables (| col | col |)
 *   - > blockquotes
 *   - `inline code` and ```code blocks```
 *   - Horizontal rules (---)
 *   - Auto-paragraphs
 *
 * Output is sanitised to escape any embedded HTML (so policy authors
 * can't inject scripts via the markdown source).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(s: string): string {
  // Escape HTML first, then apply markdown inline rules
  let out = escapeHtml(s)
  // Bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic *text* (but not ** which is already replaced)
  out = out.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3')
  // Inline code `text`
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 text-slate-800 rounded text-[0.85em]">$1</code>')
  return out
}

export function renderMarkdown(md: string): string {
  if (!md) return ''

  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  function flushList(items: string[], ordered: boolean) {
    if (items.length === 0) return
    const tag = ordered ? 'ol' : 'ul'
    const cls = ordered
      ? 'list-decimal pl-6 space-y-1.5 my-3'
      : 'list-disc pl-6 space-y-1.5 my-3'
    out.push(`<${tag} class="${cls}">`)
    for (const it of items) out.push(`<li>${inline(it)}</li>`)
    out.push(`</${tag}>`)
  }

  while (i < lines.length) {
    const ln = lines[i]

    // Horizontal rule
    if (/^---+\s*$/.test(ln)) {
      out.push('<hr class="my-5 border-slate-200" />')
      i++
      continue
    }

    // Code fence
    if (/^```/.test(ln)) {
      i++
      const buf: string[] = []
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      out.push(`<pre class="my-3 p-3 bg-slate-900 text-slate-100 rounded-md text-xs overflow-x-auto"><code>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(ln)
    if (h) {
      const level = h[1].length
      const cls =
        level === 1 ? 'text-2xl font-bold tracking-tight text-slate-900 mt-6 mb-2 first:mt-0' :
        level === 2 ? 'text-lg font-semibold tracking-tight text-slate-900 mt-5 mb-2' :
        level === 3 ? 'text-base font-semibold text-slate-900 mt-4 mb-1.5' :
                      'text-sm font-semibold text-slate-700 mt-3 mb-1'
      out.push(`<h${level} class="${cls}">${inline(h[2])}</h${level}>`)
      i++
      continue
    }

    // Blockquote
    if (/^>\s?/.test(ln)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote class="my-3 pl-4 border-l-4 border-amber-400 bg-amber-50/60 py-2 pr-3 text-slate-700 italic rounded-r-md">${inline(buf.join(' '))}</blockquote>`)
      continue
    }

    // Table (GitHub style — header row + separator + rows)
    if (/^\|.+\|\s*$/.test(ln) && /^\|.+\|\s*$/.test(lines[i + 1] ?? '') && /^\|[-:\s|]+\|\s*$/.test(lines[i + 1])) {
      const headerCells = ln.split('|').slice(1, -1).map((c) => c.trim())
      i += 2 // skip header + separator
      const rows: string[][] = []
      while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()))
        i++
      }
      out.push('<div class="my-4 overflow-x-auto">')
      out.push('<table class="w-full text-sm border-collapse">')
      out.push('<thead><tr>')
      for (const c of headerCells) {
        out.push(`<th class="text-left font-semibold text-slate-700 px-3 py-2 border-b border-slate-300 bg-slate-50">${inline(c)}</th>`)
      }
      out.push('</tr></thead><tbody>')
      for (const row of rows) {
        out.push('<tr>')
        for (const c of row) {
          out.push(`<td class="px-3 py-2 border-b border-slate-100 text-slate-700">${inline(c)}</td>`)
        }
        out.push('</tr>')
      }
      out.push('</tbody></table></div>')
      continue
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(ln)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      flushList(items, false)
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(ln)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      flushList(items, true)
      continue
    }

    // Blank line → paragraph separator (do nothing, skip)
    if (/^\s*$/.test(ln)) {
      i++
      continue
    }

    // Regular paragraph — group consecutive non-blank lines
    const buf: string[] = []
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\|.+\|\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    if (buf.length > 0) {
      out.push(`<p class="my-2.5 leading-relaxed text-slate-700">${inline(buf.join(' '))}</p>`)
    }
  }

  return out.join('\n')
}
