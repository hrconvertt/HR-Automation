import { NextResponse } from 'next/server'

/**
 * DEPRECATED — login is now handled by Clerk's <SignIn/> component on /login.
 * This stub exists only so any cached client-side code that POSTs here gets a
 * clear 410 instead of a 404 surprise.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Login moved to Clerk. Visit /login to sign in.' },
    { status: 410 },
  )
}
