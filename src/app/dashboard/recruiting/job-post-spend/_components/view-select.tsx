'use client'

/**
 * How the spend table is grouped, as a dropdown.
 *
 * It was two pill buttons. A dropdown says "this is a choice between views of
 * one table" where two pills say "these are two things", and it takes one
 * control's worth of space instead of two.
 */
import { useRouter } from 'next/navigation'

export function SpendViewSelect({ view }: { view: 'role' | 'post' }) {
  const router = useRouter()
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
        Group by
      </span>
      <select
        value={view}
        onChange={(e) => router.push(`?view=${e.target.value}`)}
        className="text-[13px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
      >
        <option value="role">Role</option>
        <option value="post">Job post</option>
      </select>
    </label>
  )
}
