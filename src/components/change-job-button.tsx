'use client'

/**
 * "Change Job" header action on the employee profile — opens the shared
 * Job Change dialog pre-filled with this employee. HR-only (rendered gated
 * server-side), refreshes the profile after a request is created.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TrendingUp } from 'lucide-react'
import JobChangeDialog from '@/components/job-change-dialog'

export default function ChangeJobButton({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <TrendingUp className="w-3.5 h-3.5" /> Change Job
      </Button>
      <JobChangeDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => router.refresh()}
        presetEmployeeId={employeeId}
      />
    </>
  )
}
