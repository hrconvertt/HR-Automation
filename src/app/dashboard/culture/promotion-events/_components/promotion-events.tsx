'use client'

/**
 * One promotion, one celebration panel.
 *
 * The announcement is generated and shown for editing rather than sent —
 * nobody's address is invented here, and who a company-wide announcement goes
 * to is a decision, not a default. Copy it, or open it in your mail client
 * with the recipients you choose.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Megaphone, Award, Cake, Heart, Copy, Check, Printer, Mail, Loader2, ChevronDown,
} from 'lucide-react'
import {
  announcementBody, announcementSubject, certificateHtml, kudosMessage,
} from '@/lib/promotion-celebration'

interface Row {
  id: string
  employeeId: string
  employeeName: string
  department: string | null
  joinedOn: string | null
  fromDesignation: string | null
  toDesignation: string
  effectiveDate: string
  status: string
  kudosPosted: boolean
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })

export function PromotionEvents({ rows, isHR }: { rows: Row[]; isHR: boolean }) {
  const [openId, setOpenId] = useState<string | null>(rows[0]?.id ?? null)

  if (rows.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">
          No promotions yet. Create one on the{' '}
          <Link href="/dashboard/culture/promotions" className="underline">Promotions</Link>{' '}
          tab and its celebration appears here.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <Celebration
          key={r.id}
          row={r}
          isHR={isHR}
          open={openId === r.id}
          onToggle={() => setOpenId(openId === r.id ? null : r.id)}
        />
      ))}
    </div>
  )
}

function Celebration({ row, isHR, open, onToggle }: {
  row: Row; isHR: boolean; open: boolean; onToggle: () => void
}) {
  const router = useRouter()
  const input = {
    employeeName: row.employeeName,
    fromDesignation: row.fromDesignation,
    toDesignation: row.toDesignation,
    department: row.department,
    effectiveDate: row.effectiveDate,
    joinedOn: row.joinedOn,
  }

  const [highlights, setHighlights] = useState('')
  const [body, setBody] = useState(() => announcementBody(input))
  const [kudos, setKudos] = useState(() => kudosMessage(input))
  const [copied, setCopied] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState(row.kudosPosted)
  const [err, setErr] = useState<string | null>(null)

  const subject = announcementSubject(input)

  function regenerate(h: string) {
    setHighlights(h)
    setBody(announcementBody({ ...input, highlights: h }))
  }

  function copy(what: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }

  /** Hands the draft to the user's mail client with no recipients filled in. */
  function openInMail() {
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
  }

  function printCertificate() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(certificateHtml(input))
    w.document.close()
  }

  async function postKudos() {
    setPosting(true); setErr(null)
    const res = await fetch('/api/culture/kudos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toId: row.employeeId, message: kudos, category: 'APPRECIATION' }),
    })
    setPosting(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setErr(d.error ?? 'Could not post the kudos.')
      return
    }
    setPosted(true)
    router.refresh()
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start justify-between gap-4 flex-wrap hover:bg-slate-50/60 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{row.employeeName}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {row.fromDesignation ?? '—'} → <span className="text-slate-700">{row.toDesignation}</span>
            {row.department && ` · ${row.department}`}
            {' · '}{day(row.effectiveDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {posted && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 border border-emerald-200 bg-emerald-50 rounded px-1.5 py-0.5">
              <Heart className="w-2.5 h-2.5" /> kudos posted
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {err && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{err}</p>}

          {/* ── Announcement ───────────────────────────────────── */}
          <Block
            icon={<Megaphone className="w-4 h-4" />}
            title="Announcement email"
            subtitle="Generated from the promotion. Edit anything before it goes out."
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => copy('body', `${subject}\n\n${body}`)}>
                  {copied === 'body' ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                  {copied === 'body' ? 'Copied' : 'Copy'}
                </Button>
                <Button size="sm" variant="outline" onClick={openInMail}>
                  <Mail className="w-3.5 h-3.5 mr-1.5" /> Open in mail
                </Button>
              </div>
            }
          >
            <label className="block mb-3">
              <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                What they actually did
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                Optional — this replaces the generic middle paragraph, and it is the
                difference between an announcement people read and one they skim.
              </span>
              <textarea
                rows={2}
                value={highlights}
                onChange={(e) => regenerate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-md border border-slate-300 text-sm"
              />
            </label>
            <p className="text-[11px] text-slate-500 mb-1">
              <span className="font-semibold uppercase tracking-wide">Subject</span> · {subject}
            </p>
            <textarea
              rows={11}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm leading-relaxed font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              Nothing is sent from here and no addresses are filled in — you choose who
              receives it in your mail client.
            </p>
          </Block>

          {/* ── Certificate ────────────────────────────────────── */}
          <Block
            icon={<Award className="w-4 h-4" />}
            title="Certificate"
            subtitle="A4 landscape, brand green, ready to print and present."
            action={
              <Button size="sm" onClick={printCertificate}>
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Print certificate
              </Button>
            }
          >
            <p className="text-sm text-slate-600">
              Opens the finished certificate with {row.employeeName}&apos;s name, the new title
              and the effective date already set, with signature lines for the Founder and
              HR — the same layout that used to be rebuilt in Canva each time.
            </p>
          </Block>

          {/* ── Cake ───────────────────────────────────────────── */}
          <Block
            icon={<Cake className="w-4 h-4" />}
            title="Cake"
            subtitle="Order the day before, not the morning of."
          >
            <p className="text-sm text-slate-600">
              Effective {day(row.effectiveDate)} — order by{' '}
              <span className="font-medium text-slate-900">
                {new Date(new Date(row.effectiveDate).getTime() - 86_400_000)
                  .toLocaleDateString('en-GB', {
                    weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC',
                  })}
              </span>.
            </p>
          </Block>

          {/* ── Kudos ──────────────────────────────────────────── */}
          <Block
            icon={<Heart className="w-4 h-4" />}
            title="Kudos"
            subtitle="Posts to the recognition wall from you."
            action={
              isHR && (
                <Button size="sm" onClick={postKudos} disabled={posting || posted}>
                  {posting
                    ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    : <Heart className="w-3.5 h-3.5 mr-1.5" />}
                  {posted ? 'Posted' : 'Post kudos'}
                </Button>
              )
            }
          >
            <textarea
              rows={2}
              value={kudos}
              disabled={posted}
              onChange={(e) => setKudos(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm disabled:bg-slate-50"
            />
          </Block>

          <div className="pt-1">
            <Link
              href={`/dashboard/culture/promotions/${row.id}`}
              className="text-xs text-slate-500 underline hover:text-slate-900"
            >
              Open the promotion record and letter
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

function Block({ icon, title, subtitle, action, children }: {
  icon: React.ReactNode; title: string; subtitle?: string
  action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-start gap-2.5">
          <span className="text-slate-400 mt-0.5">{icon}</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}
