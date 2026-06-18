import { SignIn } from '@clerk/nextjs'

// Clerk's <SignIn/> in a B&W shell. The themed appearance comes from
// <ClerkProvider> in src/app/layout.tsx; we only handle the marketing
// half of the split screen here.
export default function LoginPage() {
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

          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/login"
            forceRedirectUrl="/dashboard"
            fallbackRedirectUrl="/dashboard"
          />

          <p className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Convertt HR. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
