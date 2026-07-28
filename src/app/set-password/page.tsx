import { SetPasswordForm } from './set-password-form'

/**
 * /set-password?token=… — PUBLIC (middleware allowlist).
 *
 * Landing page for the one-time login-invite link HR emails to employees.
 * Employee sets their own password (live rule validation), is signed in via
 * the hr_token cookie, and lands on /dashboard.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const token = typeof sp.token === 'string' ? sp.token : ''

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Convertt branding */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <span className="text-slate-900 text-xl font-bold">Convertt HR</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-900">Set your password</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Choose a password for your Convertt HR account. You&apos;ll be signed
            in right away.
          </p>

          <div className="mt-6">
            {token ? (
              <SetPasswordForm token={token} />
            ) : (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700">
                This link is missing its invite token. Please open the exact link
                from your invitation email — or ask HR to send a new one.
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Convertt HR. All rights reserved.
        </p>
      </div>
    </div>
  )
}
