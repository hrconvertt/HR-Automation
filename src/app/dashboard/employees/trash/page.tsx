/**
 * Trash — employee records removed as mistakes, recoverable until emptied.
 *
 * Separate from the exit board: an archived leaver is TERMINATED and belongs in
 * the lifecycle; a trashed record was never a real employee at all. This is the
 * one place trashed records appear, and the only place they can be restored or
 * permanently removed.
 *
 * HR only.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TrashList } from './_components/trash-list'

export default async function EmployeeTrashPage() {
  const cookieStore = await cookies()
  const payload = await verifyToken(cookieStore.get('hr_token')?.value)
  if (!payload) redirect('/login')
  const role = cookieStore.get('hr_preview_role')?.value ?? payload.role
  if (role !== 'HR_ADMIN') {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-600 mt-2">The trash is HR-only.</p>
      </div>
    )
  }

  const rows = await prisma.employee.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    select: {
      id: true, fullName: true, employeeCode: true, designation: true,
      deletedAt: true, deleteReason: true, preDeleteStatus: true,
      department: { select: { name: true } },
    },
  })

  // Who trashed each — resolved from the userId stored on the row.
  const byUser = new Map<string, string>()
  const deleterIds = [...new Set(rows.map((r) => r.id))]
  if (deleterIds.length) {
    const withDeleter = await prisma.employee.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true, deletedById: true },
    })
    const uids = [...new Set(withDeleter.map((w) => w.deletedById).filter((x): x is string => !!x))]
    if (uids.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: uids } },
        select: { id: true, employee: { select: { fullName: true } } },
      })
      const uname = new Map(users.map((u) => [u.id, u.employee?.fullName ?? 'HR']))
      for (const w of withDeleter) {
        if (w.deletedById) byUser.set(w.id, uname.get(w.deletedById) ?? 'HR')
      }
    }
  }

  return (
    <TrashList
      rows={rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        employeeCode: r.employeeCode,
        designation: r.designation,
        department: r.department?.name ?? null,
        deletedAt: r.deletedAt!.toISOString(),
        deleteReason: r.deleteReason,
        preDeleteStatus: r.preDeleteStatus,
        deletedBy: byUser.get(r.id) ?? null,
      }))}
    />
  )
}
