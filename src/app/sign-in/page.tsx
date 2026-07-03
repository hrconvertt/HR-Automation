import { redirect } from 'next/navigation'

/**
 * /sign-in — legacy emergency-login URL.
 *
 * There is exactly ONE canonical sign-in route: /login. It renders Clerk's
 * <SignIn/> with a watchdog that falls back to the emergency email + password
 * form (POST /api/auth/emergency-signin) if Clerk fails to mount.
 *
 * `?method=password` opens /login directly in password mode, preserving the
 * old /sign-in behaviour for anyone with the URL bookmarked.
 */
export default function SignInPage() {
  redirect('/login?method=password')
}
