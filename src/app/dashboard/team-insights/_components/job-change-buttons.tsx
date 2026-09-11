'use client'

/**
 * "Start job change" — one labelled button per kind of change, each opening
 * the existing job-change request on that type. HR approves it exactly as it
 * would one raised from Employee Lifecycle; nothing new happens downstream.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import JobChangeDialog from '@/components/job-change-dialog'

type ChangeType = 'PROMOTION' | 'TRANSFER' | 'MANAGER_CHANGE' | 'DESIGNATION_CHANGE'

const BUTTONS: { type: ChangeType; label: string }[] = [
  { type: 'PROMOTION', label: 'Promotion' },
  { type: 'MANAGER_CHANGE', label: 'Move to another manager' },
  { type: 'TRANSFER', label: 'Transfer department' },
  { type: 'DESIGNATION_CHANGE', label: 'Change designation' },
]

export function JobChangeButtons({ employeeId }: { employeeId: string }) {
  const router = useRouter()
  const [type, setType] = useState<ChangeType | null>(null)
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map((b) => (
          <button
            key={b.type}
            type="button"
            onClick={() => setType(b.type)}
            className="text-sm font-medium px-4 py-2 rounded-full border border-slate-400 text-slate-900 hover:bg-slate-50"
          >
            {b.label}
          </button>
        ))}
      </div>
      <JobChangeDialog
        open={type !== null}
        onClose={() => setType(null)}
        onCreated={() => router.refresh()}
        presetEmployeeId={employeeId}
        presetChangeType={type ?? undefined}
      />
    </>
  )
}
