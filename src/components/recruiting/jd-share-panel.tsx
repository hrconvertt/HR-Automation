'use client'

import { useState, useEffect } from 'react'
import { Mail, Copy, Check, ExternalLink, MessageCircle, Share2, AtSign, Code2 } from 'lucide-react'

interface Props {
  requisitionId: string
  title: string
}

interface Snippet { label: string; description: string; code: string }

/**
 * Share panel that appears in the JD dialog once jdStatus='POSTED'.
 *
 *   Uses each platform's share-intent URL — no paid API integration
 *   required. HR clicks → the platform's compose window opens with
 *   the JD link + a short headline pre-filled → HR hits Post.
 *
 * Real LinkedIn/Indeed API publishing would replace this panel later.
 */
export function JdSharePanel({ requisitionId, title }: Props) {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'share' | 'embed'>('share')
  const [snippetCopied, setSnippetCopied] = useState<string | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const url = origin ? `${origin}/careers/${requisitionId}` : ''
  const embedAllUrl = origin ? `${origin}/careers/embed` : ''
  const feedUrl     = origin ? `${origin}/careers/feed.xml` : ''
  const jsonAllUrl  = origin ? `${origin}/api/careers` : ''
  const jsonOneUrl  = origin ? `${origin}/api/careers/${requisitionId}` : ''

  const snippets: Snippet[] = [
    {
      label: 'Iframe — all roles',
      description: 'Paste anywhere on convertt.co. Always shows the current open roles.',
      code: `<iframe
  src="${embedAllUrl}"
  width="100%" height="600" frameborder="0"
  style="border:0;border-radius:12px;"
  title="Convertt — Open Roles">
</iframe>`,
    },
    {
      label: 'Iframe — this role only',
      description: 'Embed just this JD on a dedicated page.',
      code: `<iframe
  src="${url}"
  width="100%" height="1200" frameborder="0"
  style="border:0;border-radius:12px;"
  title="${title}">
</iframe>`,
    },
    {
      label: 'JSON API',
      description: 'Fetch all open roles and render with your site\'s design system. CORS-open.',
      code: `fetch('${jsonAllUrl}')
  .then((r) => r.json())
  .then(({ jobs }) => {
    // jobs[]: { id, title, type, vacancies, department, postedAt }
  })`,
    },
    {
      label: 'JSON API — this role',
      description: 'Render this specific JD with your own styling.',
      code: `fetch('${jsonOneUrl}')
  .then((r) => r.json())
  .then(({ job }) => {
    // job: { id, title, jdContent, type, vacancies, department, applyUrl }
  })`,
    },
    {
      label: 'RSS feed',
      description: 'Webflow/Squarespace/Framer can syndicate this feed natively.',
      code: feedUrl,
    },
  ]
  const summary = `We're hiring: ${title}. Apply at the link.`
  const shortLine = `🚀 We're hiring: ${title} at Convertt. Lahore (On-Site). Apply →`

  const linkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  const twitter  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shortLine)}&url=${encodeURIComponent(url)}`
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(shortLine + ' ' + url)}`
  const mailto   = `mailto:?subject=${encodeURIComponent('Convertt is hiring: ' + title)}&body=${encodeURIComponent(summary + '\n\n' + url)}`

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // self-heal: clipboard blocked → user can still click the link
    }
  }

  async function copySnippet(code: string, label: string) {
    try {
      await navigator.clipboard.writeText(code)
      setSnippetCopied(label)
      setTimeout(() => setSnippetCopied(null), 2000)
    } catch { /* noop */ }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50/60 to-slate-50/20 p-4 space-y-3">
      <div>
        <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Published — distribute it</p>
        <p className="text-xs text-slate-900 mt-0.5">
          Live at <a href={url || '#'} target="_blank" rel="noreferrer" className="font-mono text-slate-700 hover:underline">{url || 'loading…'}</a>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/60 rounded-md p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setTab('share')}
          className={`px-3 py-1 text-xs font-medium rounded ${tab === 'share' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          <Share2 className="w-3 h-3 inline mr-1" /> Social
        </button>
        <button
          type="button"
          onClick={() => setTab('embed')}
          className={`px-3 py-1 text-xs font-medium rounded ${tab === 'embed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          <Code2 className="w-3 h-3 inline mr-1" /> Embed on convertt.co
        </button>
      </div>

      {tab === 'share' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <ShareButton href={linkedIn} icon={<Share2 className="w-3.5 h-3.5" />} label="LinkedIn" tone="bg-[#0a66c2] hover:bg-[#0a5cb0] text-white" />
            <ShareButton href={whatsapp} icon={<MessageCircle className="w-3.5 h-3.5" />} label="WhatsApp" tone="bg-[#25d366] hover:bg-[#1ebe5d] text-white" />
            <ShareButton href={twitter} icon={<AtSign className="w-3.5 h-3.5" />} label="X / Twitter" tone="bg-slate-900 hover:bg-slate-800 text-white" />
            <ShareButton href={mailto} icon={<Mail className="w-3.5 h-3.5" />} label="Email" tone="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50" />
            <button
              type="button"
              onClick={copy}
              disabled={!url}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-slate-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={url || '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md text-slate-700 hover:bg-slate-50 ml-auto"
            >
              Preview public page <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-[11px] text-slate-700/80 leading-relaxed">
            These open each platform&apos;s compose window with the link pre-filled — click Post / Send.
            For real LinkedIn/Indeed auto-posting we&apos;d need their paid Talent Solutions API.
          </p>
        </>
      ) : (
        <div className="space-y-2.5">
          {snippets.map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{s.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{s.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copySnippet(s.code, s.label)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex-shrink-0"
                >
                  {snippetCopied === s.label ? <Check className="w-3 h-3 text-slate-700" /> : <Copy className="w-3 h-3" />}
                  {snippetCopied === s.label ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-[10.5px] font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">{s.code}</pre>
            </div>
          ))}
          <p className="text-[11px] text-slate-700/80 leading-relaxed">
            Paste the iframe into Webflow / WordPress / Framer. The JSON API and RSS feed are CORS-open and cached for 1 minute so your site stays fast.
          </p>
        </div>
      )}
    </div>
  )
}

function ShareButton({ href, icon, label, tone }: {
  href: string; icon: React.ReactNode; label: string; tone: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md ${tone}`}
    >
      {icon} {label}
    </a>
  )
}
