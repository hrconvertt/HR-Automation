'use client'

/**
 * Step 3 · Find Candidates. Workable's three-part checklist, with only the
 * channels Convertt can actually use: the careers page, share links that tag
 * where an applicant came from, the team's referrals and the talent pool.
 *
 * Premium job boards, campaigns and a recruiter marketplace need paid
 * integrations that do not exist here, so they are not offered.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  AtSign, Banknote, Check, Code2, Copy, Globe, Link2, Mail, MessageCircle, Rss, Share2, Star, Users,
} from 'lucide-react'
import { safeFetch } from '@/lib/safe-fetch'

interface Props {
  jobId: string
  title: string
  status: string
  published: boolean
  isHR: boolean
  gateReason: string | null
  poolMatches: number
  referralsAskedAt: string | null
  onPublish?: () => void
}

function Stage({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="relative pl-11">
      <span className="absolute left-0 top-0 w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500">{blurb}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  )
}

function ActionCard({ icon: Icon, title, text, dim, children }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  text: string
  dim?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 flex flex-col ${dim ? 'opacity-60' : ''}`}>
      <Icon className="w-6 h-6 text-slate-500" />
      <p className="mt-3 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-500 flex-1">{text}</p>
      <div className="mt-3 text-sm">{children}</div>
    </div>
  )
}

const actionLink = 'font-medium text-slate-800 underline underline-offset-2 hover:text-slate-900'

function CopyButton({ value, label, disabled }: { value: string; label: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the value is on screen to select */ }
  }
  return (
    <button type="button" onClick={copy} disabled={disabled || !value}
      className={`inline-flex items-center gap-1.5 ${actionLink} disabled:text-slate-300 disabled:no-underline`}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function Share({ href, label, disabled }: { href: string; label: string; disabled: boolean }) {
  if (disabled || !href) return <span className="text-slate-300">{label}</span>
  return <a href={href} target="_blank" rel="noreferrer" className={actionLink}>{label}</a>
}

export function StepFindCandidates({
  jobId, title, status, published, isHR, gateReason, poolMatches, referralsAskedAt, onPublish,
}: Props) {
  const [origin, setOrigin] = useState('')
  const [referral, setReferral] = useState<{ busy?: boolean; text?: string }>({})
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const url = (source?: string) =>
    origin ? `${origin}/careers/${jobId}${source ? `?source=${source}` : ''}` : ''
  const line = `We're hiring: ${title} at Convertt. Apply here:`
  const linkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url('LINKEDIN'))}`
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${line} ${url()}`)}`
  const twitter = `https://twitter.com/intent/tweet?text=${encodeURIComponent(line)}&url=${encodeURIComponent(url())}`
  const mailto = `mailto:?subject=${encodeURIComponent(`Convertt is hiring: ${title}`)}&body=${encodeURIComponent(`${line}\n\n${url()}`)}`
  const embed = `<iframe src="${url()}" width="100%" height="1200" frameborder="0" style="border:0;border-radius:12px;" title="${title.replace(/"/g, '&quot;')}"></iframe>`
  const off = !published

  async function askForReferrals() {
    if (!window.confirm(`Send every active employee a notification asking for referrals for ${title}?`)) return
    setReferral({ busy: true })
    const r = await safeFetch<{ sent: number }>(`/api/recruiting/requisitions/${jobId}/referrals`, { method: 'POST' })
    setReferral({ text: r.ok ? `Sent to ${r.data?.sent ?? 0} people.` : (r.error ?? 'Could not send.') })
  }

  const askedOn = referralsAskedAt
    ? new Date(referralsAskedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : null

  return (
    <div className="space-y-6">
      {!published && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">STATUS:</span>{' '}
          {status === 'DRAFT'
            ? 'This job is still a draft and not visible to the public yet.'
            : status === 'PENDING'
              ? 'This job is waiting for HR’s approval and not visible to the public yet.'
              : 'This job is not on your careers page.'}
          {onPublish && (
            <>
              {' '}To post it to your careers page,{' '}
              <button type="button" onClick={onPublish} className="font-semibold underline underline-offset-2">
                {isHR ? 'publish it' : 'submit it for approval'}
              </button>.
            </>
          )}
          {isHR && gateReason && (
            <p className="mt-1 text-amber-800">
              Before it can be published: {gateReason}{' '}
              <Link href={`/dashboard/recruiting/requisitions/${jobId}`} className="font-medium underline underline-offset-2">
                Open the requisition form
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="relative space-y-8 before:absolute before:left-[13px] before:top-3 before:bottom-3 before:w-px before:bg-slate-200">
        <Stage n={1} title="Get off to the right start" blurb="The actions that bring in the most good applicants.">
          <ActionCard icon={Globe} title="Careers page"
            text={published ? 'Live on convertt’s careers page, with the application form from the last step.' : 'Publishing puts the job and its application form on your careers page.'}>
            {published
              ? <a href={`/careers/${jobId}`} target="_blank" rel="noreferrer" className={actionLink}>View the job page</a>
              : onPublish
                ? <button type="button" onClick={onPublish} className={actionLink}>{isHR ? 'Publish' : 'Submit for approval'}</button>
                : <span className="text-slate-400">Not published</span>}
          </ActionCard>
          <ActionCard icon={Share2} title="LinkedIn" dim={off}
            text="Opens LinkedIn with the job link filled in. Applications through it are marked LinkedIn.">
            <div className="space-y-1">
              <Share href={linkedIn} label="Share on LinkedIn" disabled={off} />
              {isHR && (
                <Link href="/dashboard/recruiting/job-post-spend" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
                  <Banknote className="w-3.5 h-3.5" /> Record a paid post
                </Link>
              )}
            </div>
          </ActionCard>
          <ActionCard icon={Users} title="Referrals" dim={off}
            text="Notifies every active employee with the job link. Applications through it are marked Referral.">
            {isHR ? (
              <div className="space-y-1">
                <button type="button" onClick={askForReferrals} disabled={off || referral.busy}
                  className={`${actionLink} disabled:text-slate-300 disabled:no-underline`}>
                  {referral.busy ? 'Sending…' : 'Ask your team for referrals'}
                </button>
                {referral.text
                  ? <p className="text-xs text-slate-500">{referral.text}</p>
                  : askedOn && <p className="text-xs text-slate-400">Last asked {askedOn}</p>}
              </div>
            ) : (
              <span className="text-slate-400">HR sends these</span>
            )}
          </ActionCard>
          <ActionCard icon={Star} title="Talent Pool"
            text={poolMatches > 0
              ? `${poolMatches} ${poolMatches === 1 ? 'person' : 'people'} kept from earlier hiring look like a fit for this title.`
              : 'Nobody kept from earlier hiring matches this title yet.'}>
            <Link href="/dashboard/recruiting?tab=pool" className={actionLink}>Open the Talent Pool</Link>
          </ActionCard>
        </Stage>

        <Stage n={2} title="More ways to share" blurb="Each opens its own app with the job link ready to send.">
          <ActionCard icon={MessageCircle} title="WhatsApp" dim={off} text="Send the job to a group or a person.">
            <Share href={whatsapp} label="Share on WhatsApp" disabled={off} />
          </ActionCard>
          <ActionCard icon={AtSign} title="X (Twitter)" dim={off} text="Post the job with its link.">
            <Share href={twitter} label="Share on X" disabled={off} />
          </ActionCard>
          <ActionCard icon={Mail} title="Email" dim={off} text="Opens your email with the job link in it.">
            <Share href={mailto} label="Write an email" disabled={off} />
          </ActionCard>
          <ActionCard icon={Link2} title="Copy the link" dim={off} text="Paste it anywhere else the job should be seen.">
            <CopyButton value={url()} label="Copy job link" disabled={off} />
          </ActionCard>
        </Stage>

        <Stage n={3} title="Finally, a few smaller actions" blurb="So applications arrive from everywhere the job appears.">
          <ActionCard icon={Code2} title="Website embed" dim={off} text="Put this job on a page of convertt.co. It stays in step with the careers page.">
            <CopyButton value={embed} label="Copy embed code" disabled={off} />
          </ActionCard>
          <ActionCard icon={Link2} title="Job shortlink" dim={off} text={url() || 'Loading…'}>
            <CopyButton value={url()} label="Copy to clipboard" disabled={off} />
          </ActionCard>
          <ActionCard icon={Rss} title="RSS feed" dim={off} text="Every open role, for sites that read job feeds.">
            <CopyButton value={origin ? `${origin}/careers/feed.xml` : ''} label="Copy feed address" disabled={off} />
          </ActionCard>
        </Stage>
      </div>
    </div>
  )
}
