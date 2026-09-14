/**
 * The picture at the top of a step or a step tile — a coloured scene with a
 * mark for what kind of step it is, drawn inline so nothing has to load.
 */
import { toneOf } from '@/lib/experience'

export function StepArt({ type, tone, size = 'lg' }: { type: string; tone: string; size?: 'lg' | 'sm' }) {
  const t = toneOf(tone)
  const big = size === 'lg'
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${t.gradient} ${big ? 'h-44 sm:h-56' : 'h-12 w-12 rounded-lg flex-shrink-0'}`} aria-hidden="true">
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <circle cx="160" cy="26" r={big ? 18 : 30} fill="#fde68a" opacity="0.85" />
        <path d="M0,96 C40,70 80,108 120,86 C150,70 175,90 200,80 L200,120 L0,120 Z" fill="#ffffff" opacity="0.35" />
        <g transform={big ? 'translate(78,34)' : 'translate(70,30) scale(1.4)'} fill="none" stroke={t.ink} strokeWidth={big ? 3 : 4} strokeLinecap="round" strokeLinejoin="round">
          {type === 'VIDEO' && (<><rect x="0" y="4" width="44" height="32" rx="6" /><path d="M18 13 L30 20 L18 27 Z" fill={t.ink} /></>)}
          {type === 'LEARNING' && (<><path d="M22 4 L44 14 L22 24 L0 14 Z" /><path d="M8 18 V30 C14 36 30 36 36 30 V18" /></>)}
          {type === 'ARTICLE' && (<><rect x="6" y="0" width="32" height="40" rx="4" /><path d="M13 11 H31 M13 19 H31 M13 27 H24" /></>)}
          {type === 'LINK' && (<><path d="M18 22 L26 14" /><path d="M14 18 L9 23 A7 7 0 0 0 19 33 L24 28" /><path d="M30 18 L35 13 A7 7 0 0 0 25 3 L20 8" /></>)}
          {type === 'TASK' && (<><rect x="2" y="2" width="38" height="36" rx="6" /><path d="M11 20 L18 27 L31 13" /></>)}
          {type === 'TEXT' && (<><path d="M4 8 H40 M4 18 H40 M4 28 H28" /></>)}
        </g>
      </svg>
    </div>
  )
}
