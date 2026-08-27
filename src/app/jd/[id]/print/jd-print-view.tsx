'use client'

/**
 * Renders the stored JD markdown as an A4 document and offers Print.
 * Deliberately minimal markdown handling — the generator only emits headings,
 * bold labels, bullets and paragraphs, so a full parser would be dead weight.
 */
import { useEffect } from 'react'

export function JdPrintView({
  title, department, body,
}: {
  title: string; department: string | null; body: string
}) {
  useEffect(() => { document.title = `JD - ${title}` }, [title])

  return (
    <div className="jd-page">
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        body { background: #f1f5f9; }
        .jd-page { max-width: 210mm; margin: 0 auto; padding: 24px 16px 64px; }
        .sheet {
          background: #fff; padding: 22mm 18mm; border-radius: 6px;
          box-shadow: 0 1px 3px rgba(15,23,42,.12);
          font-family: 'Segoe UI', Roboto, Arial, sans-serif;
          color: #16171A; font-size: 11pt; line-height: 1.65;
        }
        .sheet h1 { font-size: 20pt; font-weight: 800; letter-spacing: .12em; margin: 0 0 2pt; }
        .sheet h2 { font-size: 15pt; font-weight: 700; margin: 18pt 0 6pt; color: #0f172a; }
        .sheet h3 { font-size: 11.5pt; font-weight: 700; margin: 14pt 0 4pt; color: #334155;
                    text-transform: uppercase; letter-spacing: .06em; }
        .sheet p { margin: 0 0 8pt; }
        .sheet ul { margin: 0 0 10pt; padding-left: 16pt; }
        .sheet li { margin-bottom: 4pt; }
        .sheet hr { border: 0; border-top: 1px solid #e2e8f0; margin: 14pt 0; }
        .meta { font-size: 10.5pt; }
        .toolbar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 8px; justify-content: flex-end; }
        .toolbar button, .toolbar a {
          font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; cursor: pointer;
          padding: 8px 14px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
          text-decoration: none;
        }
        .toolbar .primary { background: #0f172a; color: #fff; border-color: #0f172a; }
        @media print {
          body { background: #fff; }
          .toolbar { display: none !important; }
          .jd-page { padding: 0; max-width: none; }
          .sheet { box-shadow: none; border-radius: 0; padding: 0; }
        }
      `}</style>

      <div className="toolbar">
        <a href="/dashboard/recruiting">Back to Recruiting</a>
        <button className="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div className="sheet">
        {renderMarkdown(body, title, department)}
      </div>
    </div>
  )
}

/** Minimal renderer for the subset of markdown generateJD produces. */
function renderMarkdown(src: string, fallbackTitle: string, department: string | null) {
  const lines = src.split(/\r?\n/)
  const out: React.ReactNode[] = []
  let bullets: string[] = []
  let sawTitle = false

  const flush = () => {
    if (!bullets.length) return
    out.push(
      <ul key={`ul-${out.length}`}>
        {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
      </ul>,
    )
    bullets = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }

    if (line.startsWith('- ')) { bullets.push(line.slice(2)); continue }
    flush()

    if (line.startsWith('### ')) { out.push(<h3 key={out.length}>{inline(line.slice(4))}</h3>); continue }
    if (line.startsWith('## '))  { out.push(<h2 key={out.length}>{inline(line.slice(3))}</h2>); continue }
    if (line.startsWith('# '))   {
      const t = line.slice(2)
      out.push(<h1 key={out.length}>{t}</h1>)
      sawTitle = true
      continue
    }
    if (line.startsWith('---')) { out.push(<hr key={out.length} />); continue }
    const isMeta = /^\*\*(Location|Employment Type|Experience|Salary|Positions|Subject Line):/.test(line)
    out.push(<p key={out.length} className={isMeta ? 'meta' : undefined}>{inline(line)}</p>)
  }
  flush()

  if (!sawTitle) {
    out.unshift(
      <h2 key="fallback-title">{fallbackTitle}{department ? ` — ${department}` : ''}</h2>,
    )
  }
  return out
}

/** Bold (**x**) and italic (*x*) only — that is all the generator emits. */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })
}
