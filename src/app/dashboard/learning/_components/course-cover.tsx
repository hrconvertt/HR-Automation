/**
 * Cover art for a course that has none.
 *
 * Workday's catalogue shows a publisher's cover on every card. None of the 37
 * programs here has artwork, and a grid of grey boxes reads as unfinished. So
 * each cover is drawn: the course's type picks the palette and the subject
 * icon, and a hash of its title picks the pattern and where things sit. The
 * same course always gets the same cover, and neighbouring courses of the same
 * type still look different from one another.
 *
 * Purely decorative — the title and type are printed in text under it, so the
 * whole cover is aria-hidden.
 */
import { Code, Users, ShieldCheck, Compass, Globe, type LucideIcon } from 'lucide-react'

const THEME: Record<string, { from: string; to: string; icon: LucideIcon; label: string }> = {
  TECHNICAL: { from: '#1e3a8a', to: '#3b82f6', icon: Code, label: 'Technical' },
  SOFT_SKILLS: { from: '#9d174d', to: '#f472b6', icon: Users, label: 'Soft skills' },
  COMPLIANCE: { from: '#064e3b', to: '#10b981', icon: ShieldCheck, label: 'Compliance' },
  ONBOARDING: { from: '#7c2d12', to: '#f59e0b', icon: Compass, label: 'Onboarding' },
  EXTERNAL: { from: '#312e81', to: '#8b5cf6', icon: Globe, label: 'External' },
}
const FALLBACK = { from: '#334155', to: '#64748b', icon: Globe, label: 'Course' }

/** FNV-1a. Stable across server and browser, so the markup never disagrees. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function CourseCover({ id, title, type, className = '' }: {
  id: string
  title: string
  type: string
  className?: string
}) {
  const t = THEME[type] ?? FALLBACK
  const h = hash(title)
  const variant = h % 4
  const a = (h >>> 3) % 180
  const b = (h >>> 7) % 60
  const c = (h >>> 11) % 260
  const Icon = t.icon
  // Gradient ids are document-global; two cards sharing one would paint each
  // other's colours. The course id makes each unique.
  const gid = `cover-${id}`

  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={t.from} />
            <stop offset="1" stopColor={t.to} />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill={`url(#${gid})`} />

        {variant === 0 && (
          <g fill="#fff">
            <circle cx={70 + a} cy={40 + b} r="72" opacity="0.10" />
            <circle cx={270 - (a % 80)} cy="160" r="56" opacity="0.08" />
            <circle cx={c} cy="18" r="26" opacity="0.12" />
          </g>
        )}
        {variant === 1 && (
          <g stroke="#fff" strokeWidth="16" opacity="0.08">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <line key={i} x1={-80 + i * 72 + (b % 30)} y1="200" x2={40 + i * 72 + (b % 30)} y2="-20" />
            ))}
          </g>
        )}
        {variant === 2 && (
          <g fill="#fff" opacity="0.2">
            {Array.from({ length: 6 }).flatMap((_, row) =>
              Array.from({ length: 10 }).map((__, col) => (
                <circle key={`${row}-${col}`} cx={16 + col * 32} cy={14 + row * 32} r="2.2" />
              )),
            )}
          </g>
        )}
        {variant === 3 && (
          <g fill="none" stroke="#fff" strokeWidth="2" opacity="0.2">
            {[0, 1, 2, 3].map((i) => (
              <path
                key={i}
                d={`M0 ${52 + i * 30} Q 80 ${24 + i * 30 + (b % 24)} 160 ${52 + i * 30} T 320 ${52 + i * 30}`}
              />
            ))}
          </g>
        )}
      </svg>

      {/* The subject, large and quiet in the corner. */}
      <Icon className="absolute -right-4 -bottom-5 w-32 h-32 text-white/20" strokeWidth={1.25} />

      {/* The badge a catalogue uses to say what kind of thing this is. */}
      <span className="absolute top-3 left-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/90 text-slate-800 shadow-sm">
        <Icon className="w-4 h-4" />
      </span>
      <span className="absolute top-[18px] right-3 text-[10px] font-semibold uppercase tracking-wider text-white/85">
        {t.label}
      </span>
    </div>
  )
}
