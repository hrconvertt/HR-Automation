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
import DeleteEmployeeButton from '@/components/delete-employee-button'
import UploadDocumentButton from '@/components/upload-document-button'
import DeleteDocumentButton from '@/components/delete-document-button'
import DocumentVisibilityToggle from '@/components/document-visibility-toggle'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import CompensationPanel from '@/components/compensation-panel'
import { canSeeBanking } from '@/lib/can-see-banking'
import { SystemRolesPanel } from '@/components/system-roles-panel'
import { BackButton } from '@/components/ui/back-button'
import { ResignationButton } from '@/components/resignation-button'
import EmployeeLifecycleTab from '@/components/employee-lifecycle-tab'
import { ResignationBanner } from '@/components/resignation-banner'
import EmployeeSelfUploadCard from '@/components/employee-self-upload-card'
import AddAssetDialog from '@/components/add-asset-dialog'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Turn database enum strings ("FEMALE", "ONSITE", "WORK_FROM_HOME") into
 * human-friendly display values ("Female", "Onsite", "Work From Home").
 * Keeps display copy consistent so the profile doesn't mix all-caps DB
 * values with sentence-case ones.
 */
function sectionsComplete(c: {
  itCleared: boolean; financeCleared: boolean; adminCleared: boolean; hrCleared: boolean
  duesCleared: boolean; employeeAcknowledged: boolean; hrCertifiedAt: Date | null
  interviewCompletedAt: Date | null; handoverSignedAt: Date | null
}): { done: number; total: number } {
  // Section 1 (assets) implicit, count 2-7
  let done = 0
  if (c.itCleared && c.financeCleared && c.adminCleared && c.hrCleared) done++ // §2
  if (c.duesCleared) done++ // §3
  if (c.employeeAcknowledged) done++ // §4
  if (c.hrCertifiedAt) done++ // §5
  if (c.interviewCompletedAt) done++ // §6
  if (c.handoverSignedAt) done++ // §7
  return { done, total: 6 }
}

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
      resignation: true,
      managerHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
      onboardingFeedback: true,
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

  // Compensation access matrix — single source of truth in src/lib/can-see-salary.ts
  //  ┌──────────────┬──────┬──────┬────────────┐
  //  │ Role         │ View │ Edit │ Download   │
  //  ├──────────────┼──────┼──────┼────────────┤
  //  │ HR_ADMIN     │  ✓   │  ✓   │     ✓      │
  //  │ EXECUTIVE    │  ✓   │      │     ✓      │  (all employees)
  //  │ FINANCE      │  ✓   │      │     ✓      │  (all employees, payroll work)
  //  │ MANAGER      │ own  │      │   own      │  NEVER sees direct reports' salary
  //  │ LEAD         │ own  │      │   own      │  NEVER sees team's salary
  //  │ EMPLOYEE     │ own  │      │   own      │
  //  └──────────────┴──────┴──────┴────────────┘
  const { canSeeSalary } = await import('@/lib/can-see-salary')
  const canViewCompensation = canSeeSalary({
    viewerRole: effectiveRole,
    viewerEmployeeId: myEmpId,
    targetEmployeeId: employee.id,
  })
  const canEditCompensation = isHR && !isPreviewMode
  const canDownloadTotalRewards = canViewCompensation

  // Performance, Documents, Leave, Assets — unchanged
  const showPerformanceTab = isHR || isExec || isViewingOwn || (isManager && isMyTeamMember)
  const showDocuments = isHR || isViewingOwn
  // Employees can only see docs HR has marked visible. HR sees everything.
  const documentsForViewer = (isHR && !isPreviewMode)
    ? employee.documents
    : employee.documents.filter((d) => d.visibleToEmployee)
  const showLeave = isHR || isViewingOwn || (isManager && isMyTeamMember)
  const showAssets = isHR || isViewingOwn || (isManager && isMyTeamMember)
  // Alias for backward compatibility with existing JSX below
  const showCompensation = canViewCompensation

  const currentSalary = employee.salary

  // Recent Payslips — same gate as Compensation. Managers + Leads never see
  // payslip amounts (compensation lockdown).
  const canSeePayslips = canViewCompensation
  const recentPayslips = canSeePayslips
    ? await prisma.payslip.findMany({
        where: { employeeId: employee.id },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        select: {
          id: true, month: true, year: true,
          grossSalary: true, netSalary: true, status: true,
        },
      })
    : []

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
          notes: null,
          effectiveDate: employee.joiningDate,
          approvedById: null,
          createdAt: employee.joiningDate,
        },
      ]
    }
  }

  // For resignation banner: latest exit clearance if any
  const latestClearance = employee.resignation
    ? await prisma.exitClearance.findFirst({
        where: { employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
      })
    : null

  // Lifecycle tab visibility per role (see brief T5)
  const showLifecycleTab = isHR || isExec || isViewingOwn || (isManager && isMyTeamMember)
  const lifecycleShowsComp = isHR || isViewingOwn
  const lifecycleShowsReviews = isHR || isViewingOwn || (isManager && isMyTeamMember)

  return (
    <div className="space-y-6">
      <BackButton fallback="/dashboard/employees" />
      {employee.resignation && (
        <ResignationBanner
          submittedAt={employee.resignation.submittedAt.toISOString()}
          intendedLastDay={employee.resignation.intendedLastDay.toISOString()}
          managerAckedAt={employee.resignation.managerAckedAt?.toISOString() ?? null}
          status={employee.resignation.status}
          clearanceSections={latestClearance ? sectionsComplete(latestClearance) : null}
        />
      )}
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
                {isViewingOwn && employee.status === 'ACTIVE' && !employee.resignation && (
                  <ResignationButton employeeType={employee.employeeType} />
                )}
                {canEditFull && (
                  <DeleteEmployeeButton
                    employeeId={employee.id}
                    employeeName={employee.fullName}
                  />
                )}
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
          {showLifecycleTab     && <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>}
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
                    ['Home Phone', employee.homePhone],
                    ['Office Phone', employee.officePhone],
                    ['Date of Birth', employee.dob ? formatDate(employee.dob) : null],
                    ['Gender', humanize(employee.gender)],
                    ['Marital Status', humanize(employee.maritalStatus)],
                    ['Nationality', employee.nationalityCountry],
                    ['Permanent Address', employee.address],
                    ['Temporary Address', employee.temporaryAddress],
                    ['Work Location Address', employee.workLocationAddress],
                    ['Emergency Contact', employee.emergencyContact],
                    ['Emergency Relation', employee.emergencyRelation],
                    ['Emergency Phone', employee.emergencyPhone],
                    ['Emergency Email', employee.emergencyEmail],
                  ] as [string, string | null | undefined][]).map(([label, value]) => value ? (
                    <div key={label} className="flex gap-3">
                      <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                      <dd className="text-gray-900">{value}</dd>
                    </div>
                  ) : null)}
                </dl>
              </CardContent>
            </Card>

            {/* Identity card — surfaces enriched CNIC + family info */}
            {(employee.fatherOrHusbandName || employee.mothersMaidenName ||
              employee.cnicIssuedOn || employee.cnicExpiresOn ||
              employee.placeOfBirth || employee.cityOfBirth || employee.cnic) && (
              <Card>
                <CardHeader><CardTitle>Identity &amp; CNIC</CardTitle></CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    {([
                      ['Father / Husband Name', employee.fatherOrHusbandName],
                      ["Mother's Maiden Name", employee.mothersMaidenName],
                      ['Place of Birth', employee.placeOfBirth],
                      ['City of Birth', employee.cityOfBirth],
                      ['CNIC #', employee.cnic],
                      ['CNIC Issued On', employee.cnicIssuedOn ? formatDate(employee.cnicIssuedOn) : null],
                      ['CNIC Expires On', employee.cnicExpiresOn ? formatDate(employee.cnicExpiresOn) : null],
                      ['Place of Issuance', employee.placeOfIssuance],
                      ['CNIC Birth Date', employee.cnicBirthDate ? formatDate(employee.cnicBirthDate) : null],
                    ] as [string, string | null | undefined][]).map(([label, value]) => value ? (
                      <div key={label} className="flex gap-3">
                        <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                        <dd className="text-gray-900">{value}</dd>
                      </div>
                    ) : null)}
                  </dl>
                </CardContent>
              </Card>
            )}

            {/* Banking — HR_ADMIN, FINANCE, and self only */}
            {canSeeBanking({
              viewerRole: effectiveRole,
              viewerEmployeeId: myEmpId,
              targetEmployeeId: employee.id,
            }) && (employee.bankAccountName || employee.bankName || employee.bankAccount || employee.ibanAccount) && (
              <Card>
                <CardHeader><CardTitle>Banking</CardTitle></CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    {([
                      ['Account Title', employee.bankAccountName],
                      ['Bank Name', employee.bankName],
                      ['Account #', employee.bankAccount],
                      ['IBAN', employee.ibanAccount],
                      ['Branch', employee.bankBranch],
                    ] as [string, string | null | undefined][]).map(([label, value]) => value ? (
                      <div key={label} className="flex gap-3">
                        <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                        <dd className="text-gray-900">{value}</dd>
                      </div>
                    ) : null)}
                  </dl>
                </CardContent>
              </Card>
            )}

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

        {/* Lifecycle */}
        {showLifecycleTab && <TabsContent value="lifecycle">
          <EmployeeLifecycleTab
            joiningDate={employee.joiningDate.toISOString()}
            confirmationDate={employee.confirmationDate?.toISOString() ?? null}
            exitDate={employee.exitDate?.toISOString() ?? null}
            designation={employee.designation}
            managerName={employee.reportingManager?.fullName ?? null}
            managerHistory={employee.managerHistory.map((h) => ({
              changedAt: h.changedAt.toISOString(),
              oldManagerId: h.oldManagerId,
              newManagerId: h.newManagerId,
              reason: h.reason,
            }))}
            compensationHistory={
              lifecycleShowsComp
                ? displayHistory.map((c) => ({
                    id: c.id,
                    effectiveDate: c.effectiveDate.toISOString(),
                    type: c.type,
                    oldSalary: c.oldSalary,
                    newSalary: c.newSalary,
                    incrementPct: c.incrementPct,
                    reason: c.reason,
                  }))
                : null
            }
            reviews={
              lifecycleShowsReviews
                ? employee.performanceReviews
                    .filter((r) => r.status === 'HR_FINALIZED')
                    .map((r) => ({
                      id: r.id,
                      reviewPeriod: r.reviewPeriod,
                      reviewType: r.reviewType,
                      overallRating: r.overallRating,
                      finalCategory: r.finalCategory,
                    }))
                : null
            }
          />
        </TabsContent>}

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
            payslips={recentPayslips.map((p) => ({
              id: p.id,
              month: p.month,
              year: p.year,
              grossSalary: p.grossSalary,
              netSalary: p.netSalary,
              status: p.status,
            }))}
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
          {isViewingOwn && !isPreviewMode && (
            <div className="mb-4">
              <EmployeeSelfUploadCard
                employeeId={employee.id}
                documents={employee.documents.map((d) => ({
                  id: d.id,
                  type: d.type,
                  createdAt: d.createdAt.toISOString(),
                  visibleToEmployee: d.visibleToEmployee,
                  signedAt: d.signedAt?.toISOString() ?? null,
                }))}
              />
            </div>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Documents</CardTitle>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/documents?employee=${employee.id}`}
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  View in Document Center <ExternalLink className="w-3 h-3" />
                </Link>
                <UploadDocumentButton employeeId={employee.id} compact />
              </div>
            </CardHeader>
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
                  {documentsForViewer.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-400">No documents.</TableCell></TableRow>
                  ) : (
                    documentsForViewer.map((doc) => {
                      // Salary slips link straight to the printable route
                      // (lazy-rendered — no blob to stream).
                      const viewHref = doc.type === 'SALARY_SLIP' && doc.url
                        ? doc.url
                        : `/api/documents/${doc.id}/download`
                      return (
                        <TableRow key={doc.id}>
                          <TableCell>{doc.name}</TableCell>
                          <TableCell><Badge variant="secondary">{doc.type}</Badge></TableCell>
                          <TableCell>{formatDate(doc.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <a
                                href={viewHref}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 text-xs hover:underline"
                              >View</a>
                              {/* HR-only visibility toggle */}
                              {canEditFull && (
                                <DocumentVisibilityToggle
                                  documentId={doc.id}
                                  initialVisible={doc.visibleToEmployee}
                                />
                              )}
                              {/* HR-only delete; canEditFull = HR_ADMIN + not in preview */}
                              {canEditFull && (
                                <DeleteDocumentButton documentId={doc.id} documentName={doc.name} />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Assigned Assets</CardTitle>
              {canEditFull && <AddAssetDialog employeeId={employee.id} />}
            </CardHeader>
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
