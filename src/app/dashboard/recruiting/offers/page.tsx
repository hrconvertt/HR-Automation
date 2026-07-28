import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { formatDate, formatCurrency } from '@/lib/utils'
import { OfferActions } from '@/components/recruiting/offer-actions'

const STATUS_TONE: Record<string, 'success' | 'secondary' | 'destructive' | 'warning' | 'default'> = {
  PENDING:   'warning',
  ACCEPTED:  'success',
  REJECTED:  'destructive',
  EXPIRED:   'secondary',
  WITHDRAWN: 'secondary',
}

export default async function OffersPage() {
  const c = await cookies()
  const tok = c.get('hr_token')?.value
  const payload = await verifyToken(tok)
  if (!payload) redirect('/login')
  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true },
  })
  if (!me) redirect('/login')
  const previewRole = c.get('hr_preview_role')?.value
  const effectiveRole = (previewRole && me.role === 'HR_ADMIN') ? previewRole : me.role
  if (effectiveRole !== 'HR_ADMIN') {
    redirect('/dashboard/recruiting')
  }

  const offers = await prisma.jobOffer.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      candidate: {
        select: {
          fullName: true,
          email: true,
          requisition: { select: { title: true } },
        },
      },
      employee: { select: { id: true, employeeCode: true, fullName: true } },
    },
  })

  const pending = offers.filter((o) => o.status === 'PENDING')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Job Offers</h1>
        <p className="text-sm text-slate-500 mt-1">
          <span className="font-semibold text-slate-900">{pending.length}</span> pending Â·
          {' '}<span className="font-semibold text-slate-900">{offers.length}</span> total
        </p>
      </div>

      <Card className="rounded-xl border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Joining</TableHead>
              <TableHead>Offer Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-slate-400 text-sm">
                  No offers created yet.
                </TableCell>
              </TableRow>
            ) : (
              offers.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-slate-900">
                    {o.candidate.fullName}
                    <p className="text-[11px] text-slate-500">{o.candidate.email}</p>
                  </TableCell>
                  <TableCell className="text-slate-700 text-sm">
                    {o.candidate.requisition?.title ?? 'â€”'}
                  </TableCell>
                  <TableCell className="tabular-nums text-slate-900">
                    {formatCurrency(o.salary)}
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {o.joiningDate ? formatDate(o.joiningDate) : 'â€”'}
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">{formatDate(o.offerDate)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_TONE[o.status] ?? 'secondary'}>{o.status}</Badge>
                    {o.status === 'REJECTED' && o.rejectionReason && (
                      <p className="text-[11px] text-slate-700 mt-0.5 max-w-[200px] line-clamp-2">
                        â€œ{o.rejectionReason}â€
                      </p>
                    )}
                    {o.statusChangedAt && o.status !== 'PENDING' && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        on {formatDate(o.statusChangedAt)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {o.status === 'PENDING' ? (
                      <OfferActions offerId={o.id} candidateName={o.candidate.fullName} />
                    ) : o.status === 'ACCEPTED' && o.employee ? (
                      <Link
                        href={`/dashboard/employees/${o.employee.id}`}
                        className="text-xs text-slate-700 hover:underline"
                      >
                        {o.employee.employeeCode}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">â€”</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
