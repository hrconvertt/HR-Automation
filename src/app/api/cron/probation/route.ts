import { NextRequest, NextResponse } from 'next/server'
import { runProbationReconciler } from '@/lib/probation-reconciler'

// Daily cron — reconciles probation records (settling check-in reminders,
// packet generation, overdue notifications, auto-enact when applicable).
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET) {
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.warn('[cron/probation] CRON_SECRET not set — running unauthenticated')
  }
  const result = await runProbationReconciler()
  return NextResponse.json({ ok: true, result })
}
