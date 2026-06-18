import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canUseLeadershipChat } from '@/lib/can-message'
import ChatShell from './_components/chat-shell'

/**
 * Leadership Chat — senior staff DMs.
 *
 * Server-side eligibility gate. Non-senior employees bounce back to
 * /dashboard (the sidebar entry is hidden for them already; this is the
 * belt to the suspenders).
 */
export default async function LeadershipChatPage({
  searchParams,
}: {
  searchParams: { with?: string }
}) {
  const payload = await verifyToken()
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      role: true,
      employee: {
        select: {
          id: true,
          fullName: true,
          designation: true,
          position: { select: { level: true } },
        },
      },
    },
  })

  if (!user || !user.employee) redirect('/dashboard')

  const eligible = canUseLeadershipChat(
    user.role,
    user.employee.designation,
    user.employee.position?.level ?? null,
  )
  if (!eligible) redirect('/dashboard')

  return (
    <div className="-m-6 lg:-m-8 h-[calc(100vh-3.5rem)] flex flex-col bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">Leadership Chat</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Direct messages — restricted to senior staff.
        </p>
      </div>
      <ChatShell
        myEmployeeId={user.employee.id}
        myName={user.employee.fullName}
        isHr={user.role === 'HR_ADMIN'}
        initialPartnerId={searchParams.with ?? null}
      />
    </div>
  )
}
