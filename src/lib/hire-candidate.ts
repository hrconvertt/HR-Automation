/**
 * promoteToEmployee — converts a HIRED candidate into a full Employee row.
 *
 * Triggered when:
 *   - PATCH /api/recruiting/candidates/[id] sets stage = HIRED
 *   - PATCH /api/recruiting/offers/[id]    sets status = ACCEPTED
 *
 * Idempotent: if an Employee already exists for the candidate's email or
 * an Employee is already linked to the JobOffer, the existing row is
 * returned and nothing else mutates.
 *
 * All multi-step writes go through `prisma.$transaction` — if any step
 * throws, the candidate's stage flip in the calling route must roll back
 * too (the caller is responsible for sequencing).
 *
 * Returns the new (or existing) Employee.id.
 */
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { notify } from '@/lib/notifications'
import { buildStandardOnboardingTasks } from '@/lib/onboarding-tasks'

/** Generate a 12-char temporary password — mixed case + digits, no symbols
 *  (easier to read in welcome emails). The plaintext is included in the
 *  EmailDraft body — never persisted on the User row. */
function tempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

/** Next sequential employee code for a department code, e.g. CON-BD-007. */
async function nextEmployeeCode(deptCode: string): Promise<string> {
  const prefix = `CON-${deptCode}-`
  const existing = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: prefix } },
    select: { employeeCode: true },
  })
  let maxN = 0
  for (const e of existing) {
    const m = e.employeeCode.match(/^CON-[A-Z]+-(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > maxN) maxN = n
    }
  }
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`
}

export interface PromoteResult {
  employeeId: string
  created: boolean
  tempPassword?: string  // only present when a new User was created
}

export async function promoteToEmployee(
  candidateId: string,
  hiredById: string,
): Promise<PromoteResult> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      requisition: {
        include: {
          requestedBy: { select: { id: true, fullName: true, email: true } },
        },
      },
      offer: true,
    },
  })
  if (!candidate) throw new Error('Candidate not found')

  // Idempotency check #1 — offer already linked to an Employee.
  if (candidate.offer?.employeeId) {
    return { employeeId: candidate.offer.employeeId, created: false }
  }

  // Idempotency check #2 — email already belongs to an Employee.
  const existingEmp = await prisma.employee.findUnique({
    where: { email: candidate.email },
    select: { id: true },
  })
  if (existingEmp) {
    // Link the offer to the existing employee so re-runs are clean.
    if (candidate.offer) {
      await prisma.jobOffer.update({
        where: { id: candidate.offer.id },
        data: { employeeId: existingEmp.id },
      })
    }
    return { employeeId: existingEmp.id, created: false }
  }

  const req = candidate.requisition
  const offer = candidate.offer

  // Department — connect to existing by id, or create from requisition.
  let departmentId: string | null = req.departmentId ?? null
  if (!departmentId) {
    // Fall back to a generic department keyed on the role title's first
    // word — keeps employee codes meaningful even without explicit dept.
    const fallbackCode = (req.title.split(/\s+/)[0] || 'GEN').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'GEN'
    const dept = await prisma.department.upsert({
      where: { code: fallbackCode },
      update: {},
      create: { code: fallbackCode, name: req.title },
    })
    departmentId = dept.id
  }

  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { code: true },
  })
  const deptCode = dept?.code ?? 'GEN'

  const employeeCode = await nextEmployeeCode(deptCode)
  const designation = req.title
  const joiningDate = offer?.joiningDate ?? new Date()
  const grossSalary = offer?.salary ?? 0
  // 60 / 30 / 10 split — same convention used in seed.ts.
  const basic = Math.round(grossSalary * 0.60)
  const houseRent = Math.round(grossSalary * 0.30)
  const otherAllowance = Math.max(0, grossSalary - basic - houseRent)

  const employeeType = req.type === 'INTERNSHIP' ? 'INTERNSHIP'
    : req.type === 'TRAINEE' ? 'TRAINING'
    : req.type === 'CONTRACT' ? 'PROBATION'
    : 'PROBATION'

  const plainPassword = tempPassword()
  const hashedPassword = await hashPassword(plainPassword)

  const result = await prisma.$transaction(async (tx) => {
    // Create User (+ EMPLOYEE role membership).
    const user = await tx.user.create({
      data: {
        email: candidate.email,
        password: hashedPassword,
        role: 'EMPLOYEE',
        mustChangePass: true,
        isActive: true,
        userRoles: { create: { role: 'EMPLOYEE' } },
      },
    })

    // Create Employee.
    const employee = await tx.employee.create({
      data: {
        employeeCode,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone ?? null,
        cnic: candidate.cnic ?? null,
        designation,
        hiringDesignation: designation,
        department: { connect: { id: departmentId! } },
        ...(req.requestedById ? { reportingManager: { connect: { id: req.requestedById } } } : {}),
        joiningDate,
        status: 'ACTIVE',
        employeeType,
        user: { connect: { id: user.id } },
      },
    })

    // Salary row (only when we actually have an offer amount).
    if (grossSalary > 0) {
      await tx.salary.create({
        data: {
          employeeId: employee.id,
          basic,
          houseRent,
          otherAllowance,
          effectiveFrom: joiningDate,
        },
      })
      await tx.compensationHistory.create({
        data: {
          employeeId: employee.id,
          effectiveDate: joiningDate,
          type: 'NEW_HIRE',
          oldSalary: 0,
          newSalary: grossSalary,
          incrementPct: 0,
          reason: 'Initial compensation at hire (auto-generated from JobOffer)',
        },
      })
    }

    // Link the JobOffer back to the new Employee.
    if (offer) {
      await tx.jobOffer.update({
        where: { id: offer.id },
        data: { employeeId: employee.id },
      })
    }

    // Onboarding checklist (idempotent — employeeId is @@unique).
    const checklist = await tx.onboardingChecklist.create({
      data: { employeeId: employee.id },
    })

    // Standard 17-item checklist (master sheet). isEmployeeUploadable
    // on items 7–11 lights up the self-upload widget on the employee profile.
    const defaultTasks = buildStandardOnboardingTasks(employeeType)
    await tx.onboardingTask.createMany({
      data: defaultTasks.map((t) => ({
        checklistId: checklist.id,
        title: t.title,
        owner: t.owner,
        category: t.category,
        orderIndex: t.orderIndex,
        description: t.description ?? null,
        isEmployeeUploadable: t.isEmployeeUploadable ?? false,
        documentType: t.documentType ?? null,
      })),
    })

    // Welcome email draft — plaintext password embedded ONCE here, never elsewhere.
    const loginUrl = process.env.APP_URL ?? 'https://hr.convertt.co'
    const welcomeSubject = `Welcome to Convertt — your account is ready`
    const welcomeHtml = `
<p>Hi ${escapeHtml(candidate.fullName.split(' ')[0])},</p>
<p>Welcome to Convertt. We're excited to have you joining as <strong>${escapeHtml(designation)}</strong>.</p>
<p>Your HR portal account has been created:</p>
<ul>
  <li><strong>Login URL:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>
  <li><strong>Email:</strong> ${escapeHtml(candidate.email)}</li>
  <li><strong>Temporary password:</strong> <code>${escapeHtml(plainPassword)}</code></li>
  <li><strong>Employee code:</strong> ${escapeHtml(employeeCode)}</li>
</ul>
<p><strong>You must change your password on first login.</strong> The temporary password above will not work after the first reset.</p>
<p><strong>First day:</strong> ${joiningDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<br/>
<strong>Location:</strong> Mega Tower, Main Boulevard Gulberg, Lahore<br/>
<strong>Please bring:</strong> CNIC copy, educational certificates, experience letters (if any), and your bank account details.</p>
<p>Your onboarding checklist is already set up in the portal — sign in to see what we'll cover in your first week.</p>
<p>Warm regards,<br/>Convertt HR</p>
`.trim()

    await tx.emailDraft.create({
      data: {
        employeeId: employee.id,
        toEmail: candidate.email,
        toName: candidate.fullName,
        subject: welcomeSubject,
        bodyHtml: welcomeHtml,
        trigger: req.type === 'INTERNSHIP' ? 'OFFER_INTERN' : 'CONFIRMATION',
        triggerRefId: employee.id,
        status: 'DRAFT',
        createdById: hiredById,
      },
    })

    return { employee, plainPassword }
  })

  // Probation record — required for PERMANENT/PROBATION. Defaults to a
  // 3-month window. INTERNSHIP/TRAINING get a record sized to their
  // contract length elsewhere; we only seed the standard case here.
  if (employeeType === 'PROBATION') {
    const probEnd = new Date(joiningDate)
    probEnd.setMonth(probEnd.getMonth() + 3)
    await prisma.probationRecord.upsert({
      where: { employeeId: result.employee.id },
      update: {},
      create: {
        employeeId: result.employee.id,
        startDate: joiningDate,
        endDate: probEnd,
        durationMonths: 3,
        status: 'ACTIVE',
      },
    }).catch((e) => { console.error('[hire-candidate] probation create failed', e) })
  }

  // Manager notification — outside the transaction; failure to notify must
  // not roll back the hire.
  if (req.requestedById) {
    await notify({
      employeeId: req.requestedById,
      type: 'GENERAL',
      title: 'New hire onboarded',
      message: `${candidate.fullName} has been hired and onboarded as ${employeeCode}.`,
      link: `/dashboard/employees/${result.employee.id}`,
    })
  }

  return {
    employeeId: result.employee.id,
    created: true,
    tempPassword: result.plainPassword,
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  } as Record<string, string>)[c])
}
