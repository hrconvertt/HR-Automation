import { ClerkSignInWithFallback } from '@/components/auth/clerk-signin-with-fallback'

// Clerk's <SignIn/> in a B&W shell, wrapped in a load watchdog that falls
// back to the emergency email + password form if Clerk's JS fails to mount
// (e.g. the deployment domain isn't allowed on the Clerk instance). The
// themed appearance comes from <ClerkProvider> in src/app/layout.tsx; we
// only handle the marketing half of the split screen here.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const startInPasswordMode = sp.method === 'password'
  // If the publishable key isn't set on Vercel, Clerk's components render
  // as null silently — leaving an empty page. Catch that explicitly and
  // show a diagnostic message so HR knows what's wrong instead of staring
  // at blank space.
  const hasKey =
    !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_')
  return (
    <div className="min-h-screen flex">
      {/* Left sidebar — marketing pitch */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-white text-xl font-bold">Convertt HR</span>
          </div>
          <div className="mt-16">
            <h2 className="text-white text-4xl font-bold leading-tight">
              Manage your workforce
              <br />
              <span className="text-slate-300">smarter and faster.</span>
            </h2>
            <p className="text-slate-400 mt-4 text-lg">
              Complete HR management — from hiring to payroll, attendance to compliance.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Employee Management', desc: 'Centralised profiles' },
            { label: 'Payroll Processing', desc: 'Automated calculations' },
            { label: 'Leave & Attendance', desc: 'Real-time tracking' },
            { label: 'Compliance', desc: 'EOBI, FBR, PSEB' },
          ].map((f) => (
            <div key={f.label} className="bg-slate-800 rounded-lg p-4">
              <p className="text-white text-sm font-semibold">{f.label}</p>
              <p className="text-slate-400 text-xs mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — Clerk SignIn */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">C</span>
            </div>
            <span className="text-slate-900 text-xl font-bold">Convertt HR</span>
          </div>

          {hasKey ? (
            <ClerkSignInWithFallback startInPasswordMode={startInPasswordMode} />
          ) : (
            <div>
              <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm mb-6">
                <p className="font-semibold text-slate-900">Standard sign-in is misconfigured.</p>
                <p className="mt-2 text-slate-700">
                  <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>{' '}
                  isn&apos;t set on this deployment. You can still sign in with
                  email &amp; password below.
                </p>
              </div>
              <ClerkSignInWithFallback startInPasswordMode />
            </div>
          )}

          {/* HR sends invitations from /dashboard/settings/users — no self sign-up */}
          <p className="mt-6 text-center text-xs text-slate-500">
            Don&apos;t have an account?{' '}
            <span className="text-slate-700 font-medium">
              Contact HR for an invitation
            </span>
            .
          </p>

          <p className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Convertt HR. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
