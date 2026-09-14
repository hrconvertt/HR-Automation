/**
 * The Help Center's banner — Workday's green and blue waves, drawn inline so
 * there is no image to load or lose.
 */
export function HelpHero() {
  return (
    <div className="relative h-24 sm:h-28 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 overflow-hidden bg-emerald-700" aria-hidden="true">
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d="M0,0 L1200,0 L1200,48 C1040,92 900,18 720,52 C540,86 380,10 220,40 C120,58 50,40 0,30 Z" fill="#93c5fd" />
        <path d="M0,120 L0,78 C160,50 300,104 480,82 C660,60 780,112 960,90 C1060,78 1140,96 1200,86 L1200,120 Z" fill="#065f46" opacity="0.55" />
        <circle cx="90" cy="118" r="70" fill="#34d399" opacity="0.35" />
      </svg>
    </div>
  )
}
