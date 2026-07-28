import { UserProfile } from '@clerk/nextjs'

// Clerk's <UserProfile/> renders the full security panel — password change,
// MFA setup, connected accounts, etc. — themed by the global appearance set
// in src/app/layout.tsx.
export default function SecurityPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Account & Security</h1>
        <p className="text-sm text-slate-500 mt-1">
          Password, MFA and connected accounts — managed by Clerk.
        </p>
      </header>
      <UserProfile path="/dashboard/settings/security" routing="path" />
    </div>
  )
}
