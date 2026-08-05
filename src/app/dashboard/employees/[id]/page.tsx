import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate, formatCurrency } from '@/lib/utils'
import { verifyToken } from '@/lib/auth'
import EditEmployeeButton from '@/components/edit-employee-button'
import DeleteEmployeeButton from '@/components/delete-employee-button'
import UploadDocumentButton from '@/components/upload-document-button'
import EmployeeDocumentRow from '@/components/employee-document-row'
import ProfilePhotoAvatar from '@/components/profile-photo-avatar'
import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import CompensationPanel from '@/components/compensation-panel'
import { canSeeBanking } from '@/lib/can-see-banking'
import { SystemRolesPanel } from '@/components/system-roles-panel'
import { BackButton } from '@/components/ui/back-button'
import { ResignationButton } from '@/components/resignation-button'
import EmployeeLifecycleTab from '@/components/employee-lifecycle-tab'
import { ResignationBanner } from '@/components/resignation-banner'
import EmployeeSelfUploadCard from '@/components/employee-self-upload-card'
import AddAssetDialog from '@/components/add-asset-dialog'
import ChangeJobButton from '@/components/change-job-button'
import RehireButton from '@/components/rehire-button'
import { JOB_CHANGE_TYPE_LABEL, type JobChangeType } from '@/lib/job-changes'
import { LOA_TYPE_LABEL, type LoaType } from '@/lib/loa'

interface PageProps {
  params: Promise<{ id: string }>
  // Which section to show. The sidebar links here rather than the page owning
  // a second copy of the list.
  searchParams: Promise<{ tab?: string }>
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
      // Explicit select: without it Prisma returns every scalar, and that
      // includes the `fileBlob` BYTEA — every CNIC scan and CV on the profile
      // was being pulled into memory just to render a table of filenames.
      documents: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, type: true, url: true, createdAt: true,
          expiryDate: true, signedAt: true, visibleToEmployee: true, fileSize: true,
        },
      },
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

export default async function EmployeeProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { tab } = await searchParams
  const activeTab = tab ?? 'overview'
  const cookieStore = await cookies()
  const token = cookieStore.get('hr_token')?.value
  const payload = await verifyToken(token)
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
      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Access denied</h2>
        <p className="text-sm text-slate-900 mt-2">
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

  // Lifecycle banners (HR-only): open job change + active leave of absence
  const [openJobChange, activeLoa] = isHR
    ? await Promise.all([
        prisma.jobChange.findFirst({
          where: { employeeId: employee.id, status: { in: ['PENDING_APPROVAL', 'APPROVED'] } },
          orderBy: { createdAt: 'desc' },
          select: { changeType: true, toDesignation: true, toDepartmentId: true, effectiveDate: true, status: true },
        }),
        prisma.leaveOfAbsence.findFirst({
          where: { employeeId: employee.id, status: { in: ['ACTIVE', 'EXTENDED'] } },
          select: { type: true, expectedReturn: true },
        }),
      ])
    : [null, null]

  // Lifecycle tab visibility per role (see brief T5)
  const showLifecycleTab = isHR || isExec || isViewingOwn || (isManager && isMyTeamMember)
  const lifecycleShowsComp = isHR || isViewingOwn
  const lifecycleShowsReviews = isHR || isViewingOwn || (isManager && isMyTeamMember)

  // Manager options + manager name lookup for the editable Role History card.
  const managerOptions = (isHR && !isPreviewMode)
    ? await prisma.employee.findMany({
        where: { status: 'ACTIVE', id: { not: employee.id } },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      })
    : []
  const managerNameById = new Map<string, string>(
    managerOptions.map((m) => [m.id, m.fullName] as const),
  )
  if (employee.reportingManager && employee.reportingManagerId) {
    managerNameById.set(employee.reportingManagerId, employee.reportingManager.fullName)
  }

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
      {/* HR-only lifecycle banners: open job change / active LOA */}
      {(openJobChange || activeLoa) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
          {openJobChange && (
            <p className="text-sm text-slate-800">
              <span className="font-semibold">
                {JOB_CHANGE_TYPE_LABEL[openJobChange.changeType as JobChangeType] ?? openJobChange.changeType}
                {openJobChange.toDesignation ? ` to ${openJobChange.toDesignation}` : ''}
              </span>
              {' — effective '}{formatDate(openJobChange.effectiveDate)},{' '}
              {openJobChange.status === 'PENDING_APPROVAL' ? 'pending approval' : 'approved (awaiting enactment)'}.{' '}
              <Link href="/dashboard/lifecycle/job-changes" className="underline hover:text-slate-900">Job Changes →</Link>
            </p>
          )}
          {activeLoa && (
            <p className="text-sm text-slate-800">
              <span className="font-semibold">
                On {LOA_TYPE_LABEL[activeLoa.type as LoaType]?.toLowerCase() ?? activeLoa.type.toLowerCase()} leave of absence
              </span>
              {' — expected back '}{formatDate(activeLoa.expectedReturn)}.{' '}
              <Link href="/dashboard/lifecycle/loa" className="underline hover:text-slate-900">Leave of Absence →</Link>
            </p>
          )}
        </div>
      )}
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start gap-5">
          <ProfilePhotoAvatar
            employeeId={employee.id}
            fullName={employee.fullName}
            photoUrl={employee.photoUrl}
            canEdit={canEditFull || canEditOwn}
          />
          <div className="flex-1 min-w-0">
            {/* The name gets the row to itself. It was competing with six
                action buttons in one flex line and losing — the name truncated
                to two letters and the employee code wrapped over three. */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900">{employee.fullName}</h1>
                <Badge variant={employee.status === 'ACTIVE' ? 'success' : 'secondary'}>
                  {employee.status}
                </Badge>
                {/* Probation is recorded as both a status and an employment
                    type, so for someone on probation both badges rendered the
                    same word. Show the type only when it says something the
                    status does not. */}
                {employee.employeeType !== employee.status && (
                  <Badge variant={employee.employeeType === 'PERMANENT' ? 'default' : 'warning'}>
                    {employee.employeeType}
                  </Badge>
                )}
              </div>
              <p className="text-gray-500 text-sm mt-1">{employee.designation}</p>
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{employee.employeeCode}</p>
            </div>

            {/* Actions on their own line, free to wrap without squeezing anything. */}
            <div className="flex items-center gap-2 flex-wrap mt-4">
                {isViewingOwn && employee.status === 'ACTIVE' && !employee.resignation && (
                  <ResignationButton employeeType={employee.employeeType} />
                )}
                {canEditFull && employee.status === 'ACTIVE' && (
                  <ChangeJobButton employeeId={employee.id} />
                )}
                {canEditFull &&
                  ['RESIGNED', 'TERMINATED', 'LAYOFF', 'INACTIVE'].includes(employee.status) && (
                  <RehireButton
                    employeeId={employee.id}
                    employeeName={employee.fullName}
                    currentDesignation={employee.designation}
                    currentDepartmentId={employee.departmentId}
                  />
                )}
                {canEditFull && (
                  /* Straight after a record is created, the employment letter
                     is the next thing HR needs. It composes from the record
                     itself — designation, joining date, CNIC, compensation —
                     and opens editable, so it is generated rather than typed. */
                  <a
                    href={`/api/documents/generate?type=offer_letter&employeeId=${employee.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-2 hover:bg-slate-50"
                    title="Generate the employment letter from this record"
                  >
                    <FileText className="w-3.5 h-3.5" /> Employment Letter
                  </a>
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
                      emergencyRelation: employee.emergencyRelation,
                      emergencyEmail: employee.emergencyEmail,
                      maritalStatus: employee.maritalStatus,
                      nationalityCountry: employee.nationalityCountry,
                      personalEmail: employee.personalEmail,
                      homePhone: employee.homePhone,
                      officePhone: employee.officePhone,
                      fatherOrHusbandName: employee.fatherOrHusbandName,
                      mothersMaidenName: employee.mothersMaidenName,
                      placeOfBirth: employee.placeOfBirth,
                      cityOfBirth: employee.cityOfBirth,
                      placeOfIssuance: employee.placeOfIssuance,
                      cnicIssuedOn: employee.cnicIssuedOn?.toISOString() ?? null,
                      cnicExpiresOn: employee.cnicExpiresOn?.toISOString() ?? null,
                      cnicBirthDate: employee.cnicBirthDate?.toISOString() ?? null,
                      ibanAccount: employee.ibanAccount,
                      bankAccountName: employee.bankAccountName,
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
                      bankCode: employee.bankCode,
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
      {/* The section list lives in the app sidebar, the same as every other
          module. TabsList is gone rather than duplicated beside it. */}
      {/* Keyed on the section so a sidebar link — a real navigation — lands on
          the right one rather than falling back to the first. */}
      <Tabs key={activeTab} defaultValue={activeTab}>
        <div className="min-w-0 w-full">

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
                  ] as [string, string | null | undefined][]).map(([label, value]) => (
                    <div key={label} className="flex gap-3">
                      <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                      <dd className={value ? 'text-gray-900' : 'text-slate-300'}>{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            {/* Identity card — surfaces enriched CNIC + family info.
                Shown for everyone, empty or not: a card that disappears when
                unpopulated makes each profile a different shape and hides the
                fact that the details are still missing. */}
            {(
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
                    ] as [string, string | null | undefined][]).map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                        <dd className={value ? 'text-gray-900' : 'text-slate-300'}>{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}

            {/* Banking — HR_ADMIN, FINANCE, and self only */}
            {canSeeBanking({
              viewerRole: effectiveRole,
              viewerEmployeeId: myEmpId,
              targetEmployeeId: employee.id,
              // Permission still gates this card; emptiness does not. Payroll
              // needs to see at a glance which accounts are still unfilled.
            }) && (
              <Card>
                <CardHeader><CardTitle>Banking</CardTitle></CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    {([
                      ['Account Title', employee.bankAccountName],
                      ['Bank Name', employee.bankName],
                      ['Bank Code', employee.bankCode],
                      ['Account #', employee.bankAccount],
                      ['IBAN', employee.ibanAccount],
                      ['Branch', employee.bankBranch],
                    ] as [string, string | null | undefined][]).map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                        <dd className={value ? 'text-gray-900' : 'text-slate-300'}>{value || '—'}</dd>
                      </div>
                    ))}
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
                  ] as [string, string | null | undefined][]).map(([label, value]) => (
                    <div key={label} className="flex gap-3">
                      <dt className="text-gray-500 w-36 flex-shrink-0">{label}</dt>
                      <dd className={value ? 'text-gray-900' : 'text-slate-300'}>{value || '—'}</dd>
                    </div>
                  ))}
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
            employeeId={employee.id}
            joiningDate={employee.joiningDate.toISOString()}
            confirmationDate={employee.confirmationDate?.toISOString() ?? null}
            exitDate={employee.exitDate?.toISOString() ?? null}
            designation={employee.designation}
            managerName={employee.reportingManager?.fullName ?? null}
            roleEntries={employee.managerHistory.map((h) => ({
              id: h.id,
              title: h.title ?? null,
              changedAt: h.changedAt.toISOString(),
              effectiveDate: h.effectiveDate?.toISOString() ?? null,
              reason: h.reason,
              notes: h.notes ?? null,
              isManual: h.isManual,
              newManagerId: h.newManagerId,
              managerName: h.newManagerId ? (managerNameById.get(h.newManagerId) ?? null) : null,
            }))}
            managers={managerOptions}
            canEditRoles={canEditFull}
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
                  className="text-xs text-slate-700 hover:underline inline-flex items-center gap-1"
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
                    documentsForViewer.map((doc) => (
                      <EmployeeDocumentRow
                        key={doc.id}
                        canEdit={canEditFull}
                        formatDate={formatDate(doc.createdAt)}
                        doc={{
                          id: doc.id,
                          name: doc.name,
                          type: doc.type,
                          url: doc.url,
                          createdAt: doc.createdAt.toISOString(),
                          expiryDate: doc.expiryDate?.toISOString() ?? null,
                          visibleToEmployee: doc.visibleToEmployee,
                          // Link-only rows (imported Drive URLs, lazily-rendered
                          // salary slips) hold no bytes, so there is nothing to
                          // read. Anything else stays enabled and lets the API
                          // give the precise reason if it can't be read.
                          hasFile: !(doc.url && !doc.fileSize),
                        }}
                      />
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
      </div>
      </Tabs>
    </div>
  )
}
