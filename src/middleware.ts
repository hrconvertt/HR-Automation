import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
  '/reset-session',
  '/unauthorized',
  '/auth-debug',
  '/sign-in',
  '/api/auth/emergency-signin',
  '/api/auth/set-password',
  '/set-password(.*)',
  '/api/bootstrap-hr',
  '/',
])

// ─── Edge-safe verification of the hr_token emergency JWT (HS256) ───────────
// Mirrors verifyEmergencyJwt() in src/lib/auth.ts, but uses Web Crypto so it
// can run in the middleware (edge) runtime. Only checks signature + expiry;
// the user row / isActive check happens in verifyToken() at the route level.

function jwtSecret(): string | null {
  const fromEnv = process.env.JWT_SECRET
  if (fromEnv && fromEnv.length >= 16) return fromEnv
  if (process.env.NODE_ENV !== 'production') {
    return 'convertt-hr-dev-only-secret-not-for-production'
  }
  return null
}

function b64UrlToBytes(str: string): Uint8Array {
  const padded = str + '==='.slice((str.length + 3) % 4)
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hasValidHrToken(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get('hr_token')?.value
  if (!token) return false
  const secret = jwtSecret()
  if (!secret) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64UrlToBytes(parts[2]) as unknown as ArrayBuffer,
      enc.encode(`${parts[0]}.${parts[1]}`),
    )
    if (!valid) return false
    const payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(parts[1]))) as {
      exp?: number
    }
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
// IMPORTANT failure modes (do not regress — see prod incident 2026-07):
//   * Never call auth.protect() here. For non-document requests it responds
//     404, which made the whole app "randomly 404" whenever the short-lived
//     Clerk session token was mid-refresh.
//   * Let clerkMiddleware run its token-refresh handshake untouched — we only
//     read `userId` from auth(); we never verify/reject the session ourselves.
//   * Unauthenticated page request  → 302 redirect to /login
//   * Unauthenticated API request   → 401 JSON { error: 'Unauthorized' }
//   * hr_token emergency JWT remains a valid parallel auth path.
export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const { userId } = await auth()
  if (userId) return

  // Emergency JWT path (works when Clerk is down/misbehaving)
  if (await hasValidHrToken(req)) return

  const { pathname } = req.nextUrl
  if (pathname.startsWith('/api') || pathname.startsWith('/trpc')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('redirect_url', pathname + req.nextUrl.search)
  return NextResponse.redirect(loginUrl, 302)
})

export const config = {
  // Run middleware on everything except Next internals and static files
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
