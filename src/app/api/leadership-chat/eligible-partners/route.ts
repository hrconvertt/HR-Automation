import { NextResponse } from 'next/server'
import { listSeniorStaffEmployees } from '@/lib/senior-staff'
import { requireChatAccess } from '../_access'

/**
 * GET /api/leadership-chat/eligible-partners
 *
 * Returns every senior-staff employee the caller can DM (excluding
 * themselves). Used by the "New chat" picker.
 */
export async function GET() {
  const gate = await requireChatAccess()
  if (!gate.ok) return gate.response
  const { access } = gate

  const all = await listSeniorStaffEmployees()
  const partners = all
    .filter((p) => p.id !== access.employeeId)
    .map((p) => ({
      id: p.id,
      fullName: p.fullName,
      designation: p.designation,
      photoUrl: p.photoUrl,
    }))

  return NextResponse.json({ partners })
}
