import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Routes that DO NOT require a Clerk session.
//   /login           — Clerk's <SignIn/> page itself
//   /careers/*       — public job listings + application form
//   /api/webhooks/*  — Clerk → us webhooks (signed)
//   /api/careers/*   — public applicant intake endpoints
//   /payslip/*/print — print views (token-scoped, not session-scoped)
//   /letters/*/print — same
//   /increment-letter/* — same
const isPublicRoute = createRouteMatcher([
  '/login(.*)',
  '/careers(.*)',
  '/api/webhooks(.*)',
  '/api/careers(.*)',
  '/payslip/(.*)/print',
  '/letters/(.*)/print',
  '/increment-letter(.*)',
  '/',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  // Run middleware on everything except Next internals and static files
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
