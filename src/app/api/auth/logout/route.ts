import { NextResponse } from 'next/server'

/**
 * Logout — Clerk owns the session. The actual sign-out happens client-side
 * via `Clerk.signOut()` in components/dashboard-chrome.tsx. This endpoint
 * remains so the existing UI fetch keeps working, and we use it to clear
 * the legacy preview-role cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true })
  // Clear legacy cookies
  for (const c of ['hr_token', 'hr_preview_role']) {
    response.cookies.set(c, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
  }
  return response
}
