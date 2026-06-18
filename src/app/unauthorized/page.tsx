/**
 * /unauthorized — rejected-by-allowlist page.
 *
 * Anyone who signs into Clerk with an email NOT in the DB's User table
 * gets their Clerk account deleted by clerk-sync.ts and lands here.
 * Plays it light but firm — they're not getting in.
 */

import UnauthorizedSignOutButton from './sign-out-button'

export const metadata = {
  title: 'Not on the list — Convertt HR',
}

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-lg w-full text-center">
        <div className="text-7xl mb-4 select-none">🚪</div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          Hold up — this isn&apos;t your party.
        </h1>
        <p className="mt-4 text-slate-600 leading-relaxed">
          Convertt HR is invite-only. Your email isn&apos;t on the guest list, and
          we&apos;ve already shown your account the door.
        </p>
        <p className="mt-4 text-slate-600 leading-relaxed">
          If you actually work at Convertt and this is a mistake — ping HR
          at <a className="text-slate-900 font-medium underline" href="mailto:hr@convertt.co">hr@convertt.co</a> with
          the email you tried. They&apos;ll add you to the allowlist and send
          a fresh invite.
        </p>
        <p className="mt-6 text-xs text-slate-400 italic">
          Otherwise: thanks for trying, but this dance floor&apos;s full. 🕺
        </p>
        <div className="mt-8">
          <UnauthorizedSignOutButton />
        </div>
      </div>
    </div>
  )
}
