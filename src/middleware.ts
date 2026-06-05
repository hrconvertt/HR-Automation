import { NextRequest, NextResponse } from 'next/server'

// Lightweight Edge-compatible JWT decode (no verification — verification happens in API routes)
function decodeTokenPayload(token: string): { userId: string; role: string; exp: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const padded = parts[1] + '==='.slice((parts[1].length + 3) % 4)
    const json = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const { pathname } = request.nextUrl

  const isLoginPage = pathname === '/login'
  const isDashboard = pathname.startsWith('/dashboard')

  const decoded = token ? decodeTokenPayload(token) : null
  const user = decoded && decoded.exp > Math.floor(Date.now() / 1000) ? decoded : null

  if (isDashboard && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoginPage && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
}
