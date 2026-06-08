/**
 * POST /api/assets — HR creates an Asset + AssetAssignment in one call.
 *
 * Body JSON:
 *   {
 *     name, assetType, brand, model, serialNumber, conditionAtIssue,
 *     costPkr, purchaseDate, custodianDept, notes,
 *     assignedToEmployeeId (optional), assetCode (optional CON-AST-NNN)
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRole(payload, 'HR_ADMIN')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Block destructive ops during HR preview-as-another-role.
  const previewRole = request.cookies.get('hr_preview_role')?.value
  if (previewRole && previewRole !== 'HR_ADMIN') {
    return NextResponse.json({ error: 'View-only while previewing role' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const name = String(body.name ?? '').trim()
  const assetType = String(body.assetType ?? 'OTHER')
  const brand = body.brand ? String(body.brand) : null
  const model = body.model ? String(body.model) : null
  const serialNumber = body.serialNumber ? String(body.serialNumber) : null
  const conditionAtIssue = body.conditionAtIssue ? String(body.conditionAtIssue) : null
  const costPkr = body.costPkr != null && body.costPkr !== '' ? Number(body.costPkr) : null
  const purchaseDate = body.purchaseDate ? new Date(String(body.purchaseDate)) : null
  const custodianDept = body.custodianDept ? String(body.custodianDept) : null
  const notes = body.notes ? String(body.notes) : null
  const assignedToEmployeeId = body.assignedToEmployeeId ? String(body.assignedToEmployeeId) : null
  const explicitCode = body.assetCode ? String(body.assetCode).trim() : null

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // Generate next code if not supplied
  let assetCode = explicitCode
  if (!assetCode) {
    const prefix = 'CON-AST-'
    const rows = await prisma.assetAssignment.findMany({
      where: { assetCode: { startsWith: prefix } },
      select: { assetCode: true },
    })
    let maxN = 0
    for (const r of rows) {
      if (!r.assetCode) continue
      const n = parseInt(r.assetCode.slice(prefix.length), 10)
      if (Number.isFinite(n) && n > maxN) maxN = n
    }
    assetCode = `${prefix}${String(maxN + 1).padStart(3, '0')}`
  }

  // Create the Asset inventory row first.
  const asset = await prisma.asset.create({
    data: {
      name,
      type: assetType,
      brand, model,
      serialNo: serialNumber,
      purchaseDate,
      value: costPkr,
      status: assignedToEmployeeId ? 'ASSIGNED' : 'AVAILABLE',
    },
  })

  // If assigned, create an AssetAssignment with all the typed fields.
  let assignment = null
  if (assignedToEmployeeId) {
    assignment = await prisma.assetAssignment.create({
      data: {
        assetId: asset.id,
        employeeId: assignedToEmployeeId,
        assignedDate: new Date(),
        assetCode,
        assetType,
        brand, model, serialNumber,
        conditionAtIssue,
        costPkr,
        purchaseDate,
        custodianDept,
        notes,
      },
    })
  }

  return NextResponse.json({ asset, assignment, assetCode })
}
