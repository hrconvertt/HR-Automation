import { Sparkles } from 'lucide-react'

export function CultureHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white shadow-md">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white/15 p-3 backdrop-blur">
          <Sparkles className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People &amp; Culture</h1>
          <p className="text-white/85 text-sm mt-1">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}
