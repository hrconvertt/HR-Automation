import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { LETTER_TYPE_LABEL, type LetterType } from '@/lib/letter-templates'
import { RequestLetterDialog } from '@/components/letters/request-letter-dialog'
import { LetterActions } from '@/components/letters/letter-actions'

type Role = 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE'

const STATUS_VARIANT: Record<string, 'success' | 'default' | 'warning' | 'secondary' | 'destructive'> = {
  PENDING: 'warning',
  APPROVED: 'default',
  GENERATED: 'success',
  REJECTED: 'destructive',
}

function typeLabel(t: string): string {
  return LETTER_TYPE_LABEL[t as LetterType] ?? t.replace('_', ' ')
}

export default async function LettersPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const role = (previewRole ?? user.role) as Role
  const employeeId = user.employee?.id ?? null
  const isPreviewMode = user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'

  // Scope WHERE by role
  let where: Record<string, unknown> = {}
  if (role === 'EMPLOYEE') {
    if (!employeeId) where = { id: '__none__' }
    else where = { employeeId }
  } else if (role === 'MANAGER' && employeeId) {
    where = {
      OR: [
        { employeeId },
        { employee: { reportingManagerId: employeeId } },
      ],
    }
  }

  const letters = await prisma.letterRequest.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true, employeeCode: true, fullName: true, designation: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ requestedAt: 'desc' }],
    take: 200,
  })

  const counts = {
    PENDING: letters.filter((l) => l.status === 'PENDING').length,
    APPROVED: letters.filter((l) => l.status === 'APPROVED').length,
    GENERATED: letters.filter((l) => l.status === 'GENERATED').length,
    REJECTED: letters.filter((l) => l.status === 'REJECTED').length,
  }

  function renderTable(rows: typeof letters, emptyText: string) {
    if (rows.length === 0) {
      return (
        <Card className="p-10 text-center text-gray-400 text-sm">{emptyText}</Card>
      )
    }
    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              {role !== 'EMPLOYEE' && <TableHead>Employee</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Purpose / Details</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => {
              const isOwn = l.employeeId === employeeId
              const canDelete =
                (isOwn && l.status === 'PENDING' && !isPreviewMode) ||
                (role === 'HR_ADMIN' && !isPreviewMode)
              const details =
                l.letterType === 'NOC_VISA'
                  ? `${l.destinationCountry ?? '—'}${l.travelFrom ? ` · ${formatDate(l.travelFrom)} → ${l.travelTo ? formatDate(l.travelTo) : '—'}` : ''}`
                  : l.letterType === 'SALARY_CERTIFICATE'
                    ? (l.bankName ?? l.purpose ?? '—')
                    : (l.purpose ?? '—')
              return (
                <TableRow key={l.id}>
                  {role !== 'EMPLOYEE' && (
                    <TableCell>
                      <p className="font-medium">{l.employee.fullName}</p>
                      <p className="text-xs text-gray-400">{l.employee.employeeCode} · {l.employee.designation}</p>
                    </TableCell>
                  )}
                  <TableCell><Badge variant="secondary">{typeLabel(l.letterType)}</Badge></TableCell>
                  <TableCell className="text-sm text-gray-700 max-w-xs truncate" title={details}>{details}</TableCell>
                  <TableCell className="font-mono text-xs">{l.letterNumber ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{formatDate(l.requestedAt)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[l.status] ?? 'default'}>{l.status}</Badge>
                    {l.status === 'REJECTED' && l.rejectionReason && (
                      <p className="text-[11px] text-red-600 mt-1 max-w-[200px]">{l.rejectionReason}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <LetterActions
                        letterId={l.id}
                        status={l.status}
                        role={role}
                        canDelete={canDelete}
                        isPreviewMode={isPreviewMode}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-amber-600" />
              Documents &amp; Letters
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {role === 'EMPLOYEE' && 'Request formal letters — experience, salary certificate, visa NOC, and more.'}
              {role === 'MANAGER'  && 'Track letter requests across your team — visibility on who is applying for visas, new jobs, loans.'}
              {role === 'HR_ADMIN' && 'Review pending letter requests and issue auto-numbered formal letters.'}
              {role === 'EXECUTIVE' && 'Letter issuance activity across the company.'}
            </p>
          </div>
          {role === 'EMPLOYEE' && !isPreviewMode && employeeId && (
            <RequestLetterDialog />
          )}
        </div>
      </div>

      {/* Employee view — single list */}
      {role === 'EMPLOYEE' ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">My Letter Requests</h2>
          {renderTable(letters, 'No letter requests yet. Click "Request a Letter" to get started.')}
        </div>
      ) : role === 'MANAGER' ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Team Letter Requests</h2>
          <p className="text-xs text-gray-500">Read-only view. HR processes letter requests.</p>
          {renderTable(letters, 'No letter requests from your team yet.')}
        </div>
      ) : (
        // HR / Executive — tabbed view
        <Tabs defaultValue="PENDING">
          <TabsList>
            <TabsTrigger value="PENDING">Pending ({counts.PENDING})</TabsTrigger>
            <TabsTrigger value="APPROVED">Approved ({counts.APPROVED})</TabsTrigger>
            <TabsTrigger value="GENERATED">Generated ({counts.GENERATED})</TabsTrigger>
            <TabsTrigger value="REJECTED">Rejected ({counts.REJECTED})</TabsTrigger>
          </TabsList>
          <TabsContent value="PENDING">
            {renderTable(letters.filter((l) => l.status === 'PENDING'), 'No pending letter requests.')}
          </TabsContent>
          <TabsContent value="APPROVED">
            {renderTable(letters.filter((l) => l.status === 'APPROVED'), 'No approved letters waiting to be handed over.')}
          </TabsContent>
          <TabsContent value="GENERATED">
            {renderTable(letters.filter((l) => l.status === 'GENERATED'), 'No generated letters yet.')}
          </TabsContent>
          <TabsContent value="REJECTED">
            {renderTable(letters.filter((l) => l.status === 'REJECTED'), 'No rejected letters.')}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
