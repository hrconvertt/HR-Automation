import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate, formatCurrency } from '@/lib/utils'
import { verifyToken } from '@/lib/auth'
import EditEmployeeButton from '@/components/edit-employee-button'
import CompensationPanel from '@/components/compensation-panel'
import { SystemRolesPanel } from '@/components/system-roles-panel'
import { BackButton } from '@/components/ui/back-button'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Turn database enum strings ("FEMALE", "ONSITE", "WORK_FROM_HOME") into
 * human-friendly display values ("Female", "Onsite", "Work From Home").
 * Keeps display copy consistent so the profile doesn't mix all-caps DB
 * values with sentence-case ones.
 */
function humanize(v: string | null | undefined): string | null {
  if (!v) return null
  // Special-case acronyms that should stay uppercase.
  const KEEP_UPPER = new Set(['HR', 'IT', 'CTO', 'CEO', 'WFH', 'WBS', 'WBW', 'MDT', 'BD'])
  return v
    .split(/[_\s]+/)
    .map((w) => {
      if (KEEP_UPPER.has(w.toUpperCase())) return w.toUpperCase()
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

async function getEmployee(id: string) {
  return prisma.employee.findUnique({
    where: { id },
    include: {
      department: true,
      position: true,
      reportingManager: { select: { fullName: true } },
      salary: true,
      compensationHistory: { orderBy: { effectiveDate: 'desc' }, take: 10 },
      leaveBalances: true,
      leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
      documents: { orderBy: { createdAt: 'desc' } },
      performanceReviews: { orderBy: { createdAt: 'desc' }, take: 5 },
      assets: {
        where: { returnedDate: null },
        include: { asset: true },
      },
    },
  })
}

export default async function EmployeeProfilePage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  if (!token) redirect('/login')
  const payload = verifyToken(token)
  if (!payload) redirect('/login')

  // Resolve effective role (HR can preview)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { id: true, reportingManagerId: true } } },
  })
  if (!user) redirect('/login')

  const previewRole =
    user.role === 'HR_ADMIN' ? cookieStore.get('hr_preview_role')?.value : undefined
  const effectiveRole = previewRole ?? user.role
  const isPreviewMode =
    user.role === 'HR_ADMIN' && !!previewRole && previewRole !== 'HR_ADMIN'
  const myEmpId = user.employee?.id ?? null

  const employee = await getEmployee(id)
  if (!employee) notFound()

  // Authorization
  const isViewingOwn = employee.id === myEmpId
  const isMyTeamMember = employee.reportingManagerId === myEmpId
  const isHR = effectiveRole === 'HR_ADMIN'
  const isExec = effectiveRole === 'EXECUTIVE'
  const isManager = effectiveRole === 'MANAGER'

  // Access control:
  //  - HR / Executive: any profile
  //  - Manager: own + direct reports
  //  - Employee: only own
  const hasAccess = isHR || isExec || isViewingOwn || (isManager && isMyTeamMember)
  if (!hasAccess) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Access denied</h2>
        <p className="text-sm text-amber-800 mt-2">
          You can only view your own profile{isManager ? ' or your direct reports' : ''}.
        </p>
      </div>
    )
  }

  // What can this viewer DO?
  //  - Edit full profile: HR (not in preview)
  //  - Edit own limited fields: the employee themselves
  //  - Otherwise: read-only
  const canEditFull = isHR && !isPreviewMode
  const canEditOwn = isViewingOwn && !isPreviewMode
  const canEdit = canEditFull || canEditOwn

  // Compensation access matrix:
  //  ┌──────────────┬──────┬──────┬────────────┐
  //  │ Role         │ View │ Edit │ Download   │
  //  ├──────────────┼──────┼──────┼────────────┤
  //  │ HR_ADMIN     │  ✓   │  ✓   │     ✓      │
  //  │ EXECUTIVE    │  ✓   │      │     ✓      │
  //  │ FINANCE      │  ✓   │      │     ✓      │
  //  │ MANAGER      │ team │      │     ✓      │  (own + direct reports)
  //  │ EMPLOYEE     │ own  │      │   own      │
  //  └──────────────┴──────┴──────┴────────────┘
  // Salary is HR + employee only (Pakistani culture / explicit spec):
  // managers and executives do NOT see compensation, even for their reports.
  const canViewCompensation = isHR || isViewingOwn
  const canEditCompensation = isHR && !isPreviewMode
  const canDownloadTotalRewards = canViewCompensation

  // Performance, Documents, Leave, Assets — unchanged
  const showPerformanceTab = isHR || isExec || isViewingOwn || (isManager && isMyTeamMember)
  const showDocuments = isHR || isViewingOwn
  const showLeave = isHR || isViewingOwn || (isManager && isMyTeamMember)
  const showAssets = isHR || isViewingOwn || (isManager && isMyTeamMember)
  // Alias for backward compatibility with existing JSX below
  const showCompensation = canViewCompensation

  const currentSalary = employee.salary

  // Seed a synthetic "Hire — Joining offer" row from the current Salary when
  // there's no CompensationHistory yet. Read-only — we don't persist it,
  // because the joining-offer row is implicit from joiningDate + Salary.
  let displayHistory = employee.compensationHistory
  if (displayHistory.length === 0 && currentSalary) {
    const gross =
      currentSalary.basic +
      currentSalary.houseRent +
      currentSalary.utilities +
      currentSalary.food +
      currentSalary.fuel +
      currentSalary.medicalAllowance +
      currentSalary.otherAllowance
    if (gross > 0) {
      displayHistory = [
        {
          id: 'seed-hire',
          employeeId: employee.id,
          type: 'INITIAL',
          oldSalary: 0,
          newSalary: gross,
          incrementPct: null,
          reason: 'Hire — Joining offer',
          effectiveDate: employee.joiningDate,
          approvedById: null,
          createdAt: employee.joiningDate,
        },
      ]
    }
  }

  return (
    <div className="space-y-6">
      <BackButton fallback="/dashboard/employees" />
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start gap-5">
          <Avatar name={employee.fullName} src={employee.photoUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-3 justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{employee.fullName}</h1>
                <p className="text-gray-500 text-sm mt-0.5">{employee.designation}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{employee.employeeCode}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={employee.status === 'ACTIVE' ? 'success' : 'secondary'}>
                  {employee.status}
                </Badge>
                <Badge variant={employee.employeeType === 'PERMANENT' ? 'default' : 'warning'}>
                  {employee.employeeType}
                </Badge>
                {canEdit && (
                  <EditEmployeeButton
                    employeeId={employee.id}
                    initialData={{
                      fullName: employee.fullName,
                      email: employee.email,
                      phone: employee.phone,
                      cnic: employee.cnic,
                      dob: employee.dob?.toISOString() ?? null,
                      gender: employee.gender,
                      address: employee.address,
                      temporaryAddress: employee.temporaryAddress,
                      workLocationAddress: employee.workLocationAddress,
                      emergencyContact: employee.emergencyContact,
                      emergencyPhone: employee.emergencyPhone,
                      designation: employee.designation,
                      departmentId: employee.departmentId,
                      reportingManagerId: employee.reportingManagerId,
                      employeeType: employee.employeeType,
                      status: employee.status,
                      workLocation: employee.workLocation,
                      timings: employee.timings,
                      workDays: employee.workDays,
                      confirmationDate: employee.confirmationDate?.toISOString() ?? null,
                      exitDate: employee.exitDate?.toISOString() ?? null,
                      bankName: employee.bankName,
                      bankAccount: employee.bankAccount,
                      bankBranch: employee.bankBranch,
                      eobiNumber: employee.eobiNumber,
                      ntn: employee.ntn,
                      sessiNumber: employee.sessiNumber,
                      hideFromDirectory: employee.hideFromDirectory,
                    }}
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Department</p>
                <p className="font-medium text-gray-900">{employee.department?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Joined</p>
                <p className="font-medium text-gray-900">{formatDate(employee.joiningDate)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Manager</p>
                <p className="font-medium text-gray-900">{employee.reportingManager?.fullName ?? '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Email</p>
                <p className="font-medium text-gray-900 truncate">{employee.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {showCompensation     && <TabsTrigger value="compensation">Compensation</TabsTrigger>}
          {showLeave            && <TabsTrigger value="leave">Leave</TabsTrigger>}
          {showDocuments        && <TabsTrigger value="documents">Documents</TabsTrigger>}
          {showPerformanceTab   && <TabsTrigger value="performance">Performance</TabsTrigger>}
          {showAssets           && <TabsTrigger value="assets">Assets</TabsTrigger>}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  {([
                    ['Phone', employee.phone],
                    ['CNIC', employee.cnic],
                    ['Date of Birth', employee.dob ? formatDate(employee.dob) : null],
                    ['Gender', humanize(employee.gender)],
                    ['Permanent Address', employee.address],
                    ['Temporary Address', employee.temporaryAddress],
                    ['Work Location Address', employee.workLocationAddress],
                    ['Emergency Contact', employee.emergencyContact],
                    ['Emergency Phone', employee.emergencyPhone],
                  ] as [string, string | null | undefined][]).map(([label, value]) => value ? (
                    <div key={label} className="flex gap-3">
                      <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                      <dd className="text-gray-900">{value}</dd>
                    </div>
                  ) : null)}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Job Information</CardTitle></CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  {/* Hiring Designation hidden — current Designation is the
                      source of truth for display. The field still exists in
                      the DB and Edit dialog if HR wants to capture it. */}
                  {([
                    ['Designation', employee.designation],
                    ['Department', employee.department?.name],
                    ['Position Level', employee.position?.level],
                    ['Work Location', humanize(employee.workLocation)],
                    ['Timings', employee.timings],
                    ['Work Schedule', employee.workDays.replace(/,/g, ' · ')],
                    ['Joining Date', formatDate(employee.joiningDate)],
                    ['Confirmation Date', employee.confirmationDate ? formatDate(employee.confirmationDate) : null],
                  ] as [string, string | null | undefined][]).map(([label, value]) => value ? (
                    <div key={label} className="flex gap-3">
                      <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                      <dd className="text-gray-900">{value}</dd>
                    </div>
                  ) : null)}
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* HR-only system roles panel — multi-role assignment */}
          {isHR && !isPreviewMode && employee.userId && (
            <div className="mt-4">
              <SystemRolesPanel employeeId={employee.id} employeeName={employee.fullName} />
            </div>
          )}
        </TabsContent>

        {/* ─── Compensation ─────────────────────────────────────────── */}
        {showCompensation && <TabsContent value="compensation">
          <CompensationPanel
            employeeId={employee.id}
            employeeName={employee.fullName}
            currentSalary={currentSalary}
            history={displayHistory.map((c) => ({
              id: c.id,
              effectiveDate: c.effectiveDate.toISOString(),
              type: c.type,
              oldSalary: c.oldSalary,
              newSalary: c.newSalary,
              incrementPct: c.incrementPct,
              reason: c.reason,
            }))}
            access={{
              canEdit: canEditCompensation,
              canDownload: canDownloadTotalRewards,
              viewerRole: effectiveRole,
            }}
          />
        </TabsContent>}

        {/* Leave */}
        {showLeave && <TabsContent value="leave">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {employee.leaveBalances.map((bal) => (
                <Card key={bal.id}>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500">{bal.leaveType}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{bal.remaining}</p>
                    <p className="text-xs text-gray-400">{bal.used} used of {bal.allocated} total</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle>Leave History</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employee.leaveRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.leaveType}</TableCell>
                        <TableCell>{formatDate(r.fromDate)}</TableCell>
                        <TableCell>{formatDate(r.toDate)}</TableCell>
                        <TableCell>{r.days}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'destructive' : 'warning'}>
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>}

        {/* Documents */}
        {showDocuments && <TabsContent value="documents">
          <Card>
            <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employee.documents.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-400">No documents.</TableCell></TableRow>
                  ) : (
                    employee.documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>{doc.name}</TableCell>
                        <TableCell><Badge variant="secondary">{doc.type}</Badge></TableCell>
                        <TableCell>{formatDate(doc.createdAt)}</TableCell>
                        <TableCell>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline">View</a>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>}

        {/* Performance */}
        {showPerformanceTab && <TabsContent value="performance">
          <Card>
            <CardHeader><CardTitle>Performance Reviews</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Overall Rating</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employee.performanceReviews.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-400">No reviews.</TableCell></TableRow>
                  ) : (
                    employee.performanceReviews.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.reviewPeriod}</TableCell>
                        <TableCell>{r.reviewType}</TableCell>
                        <TableCell>{r.overallRating ? `${r.overallRating}/5` : '—'}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'HR_FINALIZED' ? 'success' : 'warning'}>{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>}

        {/* Assets */}
        {showAssets && <TabsContent value="assets">
          <Card>
            <CardHeader><CardTitle>Assigned Assets</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Serial No</TableHead>
                    <TableHead>Assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employee.assets.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-400">No assets assigned.</TableCell></TableRow>
                  ) : (
                    employee.assets.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.asset.name}</TableCell>
                        <TableCell><Badge variant="secondary">{a.asset.type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{a.asset.serialNo ?? '—'}</TableCell>
                        <TableCell>{formatDate(a.assignedDate)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>}
      </Tabs>
    </div>
  )
}
