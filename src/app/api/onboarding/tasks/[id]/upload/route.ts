/**
 * POST /api/onboarding/tasks/[id]/upload
 *
 * Multipart upload — attaches a file to an onboarding task and marks the
 * task COMPLETED. The file is stored in EmployeeDocument (BYTEA) and
 * automatically appears in the employee's Documents tab.
 *
 * Auth: HR_ADMIN, the employee's manager, or the employee themselves.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { notify } from '@/lib/notifications'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { role: true, employee: { select: { id: true } } },
  })
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.onboardingTask.findUnique({
    where: { id },
    include: {
      checklist: {
        include: {
          employee: { select: { id: true, fullName: true, reportingManagerId: true, status: true } },
        },
      },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Block uploads against exited employees.
  if (['RESIGNED', 'TERMINATED', 'INACTIVE', 'LAYOFF'].includes(task.checklist.employee.status)) {
    return NextResponse.json({ error: 'Employee is no longer active' }, { status: 403 })
  }

  const isHR = me.role === 'HR_ADMIN'
  const isManager = me.role === 'MANAGER' && me.employee?.id === task.checklist.employee.reportingManagerId
  const isSelf = me.employee?.id === task.checklist.employee.id
  if (!isHR && !isManager && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File exceeds 5MB' }, { status: 413 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Unsupported file type. Allowed: PDF, JPG, PNG, DOCX.' }, { status: 415 })

  const buf = Buffer.from(await file.arrayBuffer())
  // Prefer the documentType slot the task already maps to; otherwise tag it
  // as a generic onboarding doc so the Documents tab still groups sensibly.
  const docType = task.documentType ?? 'ONBOARDING_DOC'

  const doc = await prisma.employeeDocument.create({
    data: {
      employeeId: task.checklist.employee.id,
      type: docType,
      name: task.title,
      url: '',
      size: buf.length,
      mimeType: file.type,
      fileBlob: buf,
      fileMimeType: file.type,
      fileSize: buf.length,
      uploadedById: payload.userId,
      visibleToEmployee: true,
    },
    select: { id: true, name: true, type: true, fileSize: true, createdAt: true },
  })

  const updated = await prisma.onboardingTask.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      isComplete: true,
      attachedDocumentId: doc.id,
      completedAt: new Date(),
      completedById: payload.userId,
      notRequiredReason: null,
    },
  })

  // Notify the employee's manager + every HR_ADMIN.
  const empLink = `/dashboard/onboarding/${task.checklist.employee.id}`
  if (task.checklist.employee.reportingManagerId) {
    await notify({
      employeeId: task.checklist.employee.reportingManagerId,
      type: 'GENERAL',
      title: 'Onboarding task completed',
      message: `${task.checklist.employee.fullName}: ${task.title} — document uploaded`,
      link: empLink,
    })
  }
  const hrs = await prisma.user.findMany({ where: { role: 'HR_ADMIN' }, select: { employee: { select: { id: true } } } })
  for (const u of hrs) {
    if (u.employee?.id) {
      await notify({
        employeeId: u.employee.id,
        type: 'GENERAL',
        title: 'Onboarding task completed',
        message: `${task.checklist.employee.fullName}: ${task.title} — document uploaded`,
        link: empLink,
      })
    }
  }

  return NextResponse.json({ task: updated, document: doc })
}
