import {
  Sparkles, LayoutDashboard, Users, Clock, CalendarDays,
  Banknote, TrendingUp, FolderOpen, LifeBuoy, Settings, ShieldCheck,
  UserPlus, Mail, Award,
} from 'lucide-react'

export interface Guide {
  slug: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  // Which roles should see this guide (in their help index)
  roles: ('HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'EXECUTIVE')[]
  Content: React.ComponentType
}

// ─── Tiny re-usable building blocks for guide content ───────────────────────

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] text-gray-700 leading-relaxed">{children}</div>
    </section>
  )
}

export function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2">
      <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <div className="flex-1">
        <p className="font-semibold text-gray-900">{title}</p>
        <div className="mt-1 text-gray-700">{children}</div>
      </div>
    </div>
  )
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900 flex gap-2">
      <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  )
}

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
      ⚠️ {children}
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <code className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono">{children}</code>
}

// ─── GUIDES ──────────────────────────────────────────────────────────────────

function GettingStarted() {
  return (
    <>
      <Section title="Welcome to Convertt HR">
        <p>
          The all-in-one HR platform for Convertt — payroll, attendance, leave, performance, onboarding, offboarding, and policies. Every module adapts to your role: an Employee sees their own data, a Manager sees their team, HR sees everything.
        </p>
        <Tip>
          Use the floating <strong>💬 chat bubble</strong> bottom-right of any page to ask the AI HR assistant in plain English. Or open the Help Center for module-by-module guides.
        </Tip>
      </Section>

      <Section title="Your role decides your view">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Employee</strong> — My Time, My Leave, My Payslips, My Reviews, My Documents</li>
          <li><strong>Manager</strong> — everything above + Team Time, leave approvals, Show Cause flagging, performance reviews for direct reports</li>
          <li><strong>HR</strong> — full org access: hire/terminate, run payroll, configure security, send emails, manage policies, issue formal Show Cause</li>
          <li><strong>CEO / Executive</strong> — strategic dashboards: headcount, payroll cost, attrition, performance distribution (read-only)</li>
        </ul>
      </Section>

      <Section title="HR can preview as any role">
        <p>HR users can switch view via the role pill in the top bar. While in preview:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Amber banner appears at the top: <em>"Viewing as X"</em>.</li>
          <li>The sidebar, dashboard, and module tabs all switch to that role&apos;s experience.</li>
          <li>Destructive actions (run payroll, approve leave, issue Show Cause, send emails) are blocked until you switch back.</li>
          <li>This is how HR verifies what an employee will actually see.</li>
        </ul>
      </Section>

      <Section title="Sidebar can be collapsed">
        <p>
          Click the <Kbd>☰</Kbd> menu icon in the top-left to hide or show the sidebar. On desktop, your choice is remembered between visits.
        </p>
      </Section>

      <Section title="First-time setup checklist">
        <Step n={1} title="Open the Dashboard">Your home page is role-specific — Employee sees self-service, HR sees company KPIs.</Step>
        <Step n={2} title="Complete your profile">People → click your name → Edit Profile. Fill in phone, CNIC, bank account, emergency contacts.</Step>
        <Step n={3} title="Clock in for the day">Attendance → Check In. Pick Onsite or WFH. Browser will ask for location permission.</Step>
        <Step n={4} title="Check the bell">Notifications bell in the top bar (next to your avatar) — leaves needing approval, new payslips, etc.</Step>
        <Step n={5} title="Need help?">Help Desk module for tickets. Or click any module&apos;s entry in this Help Center.</Step>
      </Section>
    </>
  )
}

function DashboardGuide() {
  return (
    <>
      <Section title="What you see on the dashboard">
        <p>The dashboard is your daily start point. Cards and KPIs differ per role.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Employee</strong> — your leave balance, recent payslip, today&apos;s attendance status, pending acknowledgments, announcements.</li>
          <li><strong>Manager</strong> — team status today, leaves pending your approval, team performance review progress, Show Cause matters you&apos;re managing.</li>
          <li><strong>HR</strong> — Total Employees, On Leave Today, Pending Approvals, This Month Payroll, Quick Actions (Add Employee, Run Payroll, Compliance Reports, Hiring Pipeline), Recent Leave Requests, Payroll Status, Announcements.</li>
          <li><strong>CEO / Executive</strong> — strategic KPIs only: headcount, payroll spend, attrition, performance distribution.</li>
        </ul>
      </Section>
      <Section title="Quick action cards (HR only)">
        <p>The colored cards under the KPI tiles are shortcuts:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Add Employee</strong> → People page with the new-hire dialog open</li>
          <li><strong>Run Payroll</strong> → Payroll page for the current month</li>
          <li><strong>Compliance Reports</strong> → tax/EOBI/FBR snapshot</li>
          <li><strong>Hiring Pipeline</strong> → Recruiting module with open requisitions</li>
        </ul>
      </Section>
    </>
  )
}

function PeopleGuide() {
  return (
    <>
      <Section title="People directory">
        <p>The central employee record. Everyone can browse the directory; HR + the employee themselves can edit.</p>
      </Section>

      <Section title="What HR can do here">
        <Step n={1} title="Add an employee">"+ Add Employee" button top-right. Fill name, designation, dept, employee type (Permanent/Probation/Internship/Training), joining date, reporting manager.</Step>
        <Step n={2} title="Edit any employee's profile">Click their row → "Edit Profile". You can change personal info, addresses (permanent / temporary / work location), job info, <strong>reporting manager</strong>, work schedule, status, confirmation/exit dates.</Step>
        <Step n={3} title="Set or change salary">Open the employee → Compensation tab → <strong>Request Compensation Change</strong>. Pick change type (Annual Increment / Promotion / Bonus / Market Adjustment), edit pay components, see live before/after diff. Optional in-app + email notification to the employee. Every change is logged with reason + approver.</Step>
        <Step n={4} title="Assign system roles">Open the employee → System Roles panel. Tick Employee / Manager / Executive / HR_ADMIN — a single user can hold multiple roles simultaneously.</Step>
        <Step n={5} title="Generate documents">Compensation tab → Total Rewards button. Or via the Onboarding/Offboarding journey — every relevant task has a ✨ Generate document button.</Step>
      </Section>

      <Section title="Employees see only their own data">
        <p>An employee viewing their own profile gets the same tabs but read-only (except for limited self-edit fields like phone or emergency contact, and acknowledging policies).</p>
      </Section>

      <Section title="Managers see their direct reports">
        <p>A Manager can open any direct report&apos;s profile and view (not edit) Compensation, Leave, Performance, Assets. To change someone&apos;s pay or status, ask HR.</p>
      </Section>
    </>
  )
}

function AttendanceGuide() {
  return (
    <>
      <Section title="Three completely different views">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Employee</strong> sees <em>"My Time"</em> — big Check-In card with live timer, this week&apos;s hours bar, recent punches.</li>
          <li><strong>Manager</strong> sees <em>"Team Time"</em> — team status pills, exceptions inbox (anomalies + no-clockouts), direct reports roster.</li>
          <li><strong>HR</strong> sees <em>"Time &amp; Attendance Administration"</em> — full Today snapshot, monthly calendar, monthly report, overtime approvals, devices, plus a link to Clock-in Security settings.</li>
        </ul>
      </Section>

      <Section title="Clocking in / out (everyone)">
        <Step n={1} title="Pick where you're working">Onsite or WFH toggle on the check-in card.</Step>
        <Step n={2} title="Click Check In">Your browser asks for location permission. The system runs a 5-layer trust check:</Step>
        <Step n={3} title="System scores 0–100">+40 trusted device, +25 IP whitelist match, +15 SSID match (mobile only), +20 geofence match. ≥80 auto-approves, 50–79 flags for manager review, &lt;50 blocks.</Step>
        <Step n={4} title="Done — live timer shows elapsed">When you check out, hours worked + overtime are calculated automatically.</Step>
      </Section>

      <Section title="Clock-in security (HR setup)">
        <p>From Attendance, click <Kbd>🛡 Clock-in Security Settings</Kbd>. Two things to configure:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Allowed Locations</strong> — Add the office (IP CIDRs from your ISP, SSIDs, geo coordinates + radius). Add registered home addresses for permanent WFH staff.</li>
          <li><strong>Trusted Devices</strong> — First time an employee clocks in from a new laptop, the system records it as <em>PENDING</em>. HR clicks Trust on the Pending tab. Future clock-ins from that device get the +40 bonus.</li>
        </ul>
        <Warn>
          Without at least one Location, scoring is permissive. Add your office IP &amp; geofence before going live, so off-network clock-ins get flagged.
        </Warn>
      </Section>

      <Section title="Manager exceptions inbox">
        <p>Anomalies auto-detected and shown to the manager:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>High severity</strong> — clocked in &gt;60 min late, off-network clock-in, blocked clock-in attempts</li>
          <li><strong>Medium</strong> — absent (no clock-in by end of day)</li>
          <li><strong>Low</strong> — forgotten clock-out (&gt;10h still clocked in)</li>
        </ul>
        <p>Each exception shows the employee&apos;s name + reason + a link to their profile. The list auto-refreshes every 60 seconds.</p>
      </Section>

      <Section title="Overtime (HR + Manager)">
        <p>Any hours over the standard work-day are calculated automatically at clock-out and saved as <em>pending overtime</em>. From the Overtime tab, managers approve or reject; only approved hours are added to payroll.</p>
      </Section>
    </>
  )
}

function LeaveGuide() {
  return (
    <>
      <Section title="Leave policy at Convertt">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Permanent / Probation:</strong> 24 days/year — <strong>12 Casual + 12 Sick</strong>, accrued monthly.</li>
          <li><strong>Internship / Training:</strong> 1 Emergency leave per period.</li>
          <li>Unused leave is encashed in the Full &amp; Final on departure.</li>
        </ul>
      </Section>

      <Section title="Requesting leave (Employee)">
        <Step n={1} title="Open Leave from the sidebar">You see your current balance for each type at the top.</Step>
        <Step n={2} title='Click "+ Request Leave"'>Pick type (Casual / Sick / Annual / Emergency), start &amp; end dates, reason.</Step>
        <Step n={3} title="Submit">Goes to your reporting manager. They get an in-app notification.</Step>
        <Step n={4} title="Track status">Pending → Approved → applied to your balance. Rejection shows the reason inline.</Step>
      </Section>

      <Section title="Approving leave (Manager / HR)">
        <p>From your dashboard or the Leave module, pending requests appear in your inbox. Each shows:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Days requested, type, employee&apos;s current balance</li>
          <li>Reason &amp; any conflict with team coverage</li>
          <li>Approve or Reject with optional comment</li>
        </ul>
        <p>Approved leave shows up on the employee&apos;s My Time week-bar as <em>Leave</em> and is excluded from the payroll &quot;present days&quot; count.</p>
      </Section>

      <Section title="HR's responsibilities">
        <ul className="list-disc pl-5 space-y-1">
          <li>Initialise balances at year-start (one-click via Settings → Leave Policy).</li>
          <li>Approve cross-team or extended leave (medical, maternity, paternity).</li>
          <li>Handle policy exceptions through the Help Desk.</li>
        </ul>
      </Section>
    </>
  )
}

function PayrollGuide() {
  return (
    <>
      <Section title="Payroll cycle — when to do what">
        <p>Convertt runs payroll monthly. Here&apos;s the calendar &amp; the 8-stage approval chain:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Day 20</strong> — Attendance + leave + OT data freeze (cutoff)</li>
          <li><strong>Day 22</strong> — HR clicks <em>Generate Payroll</em> → status becomes <strong>DRAFT</strong></li>
          <li><strong>Day 22</strong> — HR clicks <em>Run Calculation</em> → status <strong>CALCULATED</strong>, all managers get notified</li>
          <li><strong>Day 23–24</strong> — Each manager clicks <em>Confirm Team Hours</em> → status <strong>MANAGER_CONFIRMED</strong></li>
          <li><strong>Day 24</strong> — Finance Lead clicks <em>Finance Review</em> → status <strong>FINANCE_REVIEWED</strong></li>
          <li><strong>Day 25</strong> — Executive clicks <em>Final Approval</em> → status <strong>APPROVED</strong></li>
          <li><strong>Day 26</strong> — HR clicks <em>Lock Run</em> → status <strong>LOCKED</strong>, payslips become APPROVED, bank file ready</li>
          <li><strong>Day 28–30</strong> — HR clicks <em>Mark Disbursed</em> → status <strong>DISBURSED</strong>, every employee gets a "💰 Payslip Released" notification</li>
          <li><strong>Next month, Day 5</strong> — HR clicks <em>Close Period</em> → status <strong>CLOSED</strong>, read-only forever</li>
        </ul>
      </Section>

      <Section title="The approval stepper">
        <p>On the Payroll page, the stepper shows all 8 stages. The current stage is highlighted in blue; completed stages are green with a check. Each role only sees buttons for actions they can take.</p>
        <Tip>
          Need to roll back? <strong>Recall One Stage</strong> (HR only, before LOCKED) walks back one step without invalidating prior approvals. Or <strong>Reject</strong> with a reason to reset to DRAFT.
        </Tip>
        <p>Click <em>Show approval history</em> to see the full timestamped audit log — who did what, when, and any comments.</p>
      </Section>

      <Section title="Payslip preview &amp; download">
        <p>Every payslip can be previewed as a print-ready document. From any payroll row, click the download icon → opens the personalised slip with:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Convertt Ltd header + month + reference ID</li>
          <li>Employee details (ID, designation, dept, type of employment, joining date, CNIC, location, working days for the month, bank account)</li>
          <li>Earnings &amp; Deductions side-by-side tables</li>
          <li>Performance Bonus and Overtime as separate lines</li>
          <li>Big Net Pay banner</li>
        </ul>
        <p>Click <strong>Print / Save as PDF</strong> in the toolbar to save.</p>
      </Section>

      <Section title="Compensation changes">
        <p>To change anyone&apos;s salary: People → Employee → Compensation tab → <strong>Request Compensation Change</strong>.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Pick change type: Annual Increment / Promotion / Bonus / Market Adjustment / Initial Setup</li>
          <li>Edit each pay component (Basic, House Rent, Utilities, Food, Fuel, Medical, Other)</li>
          <li>Live before/after comparison with +/− delta and percentage</li>
          <li>Reason field (required)</li>
          <li>Notify in-app + email — the employee gets a compensation-update notification with the new amounts</li>
          <li>Every change writes a CompensationHistory row (audit trail)</li>
        </ul>
        <p>The new salary is picked up by the <em>next</em> payroll run on or after the effective date. Already-generated runs aren&apos;t affected.</p>
      </Section>

      <Section title="What each role sees on Payroll">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Employee</strong> — only their own payslips. Big &quot;View / Print PDF&quot; button. Year-to-date stats (gross, net, tax, EOBI).</li>
          <li><strong>Manager</strong> — their team&apos;s payslips + their own. Same View/Print on each row.</li>
          <li><strong>HR</strong> — everything: all employees, approval stepper, approval history, totals dashboard.</li>
          <li><strong>CEO / Executive</strong> — totals + status only (no individual amounts unless they&apos;re managing a team).</li>
        </ul>
      </Section>
    </>
  )
}

function PerformanceGuide() {
  return (
    <>
      <Section title="What's in Performance">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Overview</strong> — cycle progress, rating distribution, goals status</li>
          <li><strong>Goals</strong> — set/edit/track goals with weights and achievement %</li>
          <li><strong>Reviews</strong> — self-appraisal → manager review → HR finalization (Workday confidentiality model)</li>
          <li><strong>Show Cause</strong> — manager-initiated performance concern workflow (see below)</li>
          <li><strong>PIP</strong> — formal Performance Improvement Plans with weekly check-ins</li>
        </ul>
      </Section>

      <Section title="Review cycles (HR)">
        <Step n={1} title="Open a cycle">From Performance → Reviews → <em>Open Review Cycle</em>. Pick Quarter (Q1–Q4) + Year. The system blocks duplicates and shows existing cycles.</Step>
        <Step n={2} title="System auto-creates a review per active employee">Each linked to that employee&apos;s goals for self-rating + achievement %.</Step>
        <Step n={3} title="Employees fill self-appraisal">Only they can see their own self-rating until they submit.</Step>
        <Step n={4} title="Manager evaluates">After self-submit, the employee&apos;s scores are scrubbed from the manager view until manager submits. Manager sees their own evaluation form.</Step>
        <Step n={5} title="HR finalizes">HR reviews both scores, sets the final rating, and marks the cycle complete. Until this step, the employee can&apos;t see the manager&apos;s scores.</Step>
      </Section>

      <Section title="Confidentiality">
        <ul className="list-disc pl-5 space-y-1">
          <li>Employee fills their own self-appraisal — only they see it until they submit.</li>
          <li>Manager fills theirs separately — employee can&apos;t see manager&apos;s scores until HR finalizes.</li>
          <li>HR sees both at finalization and sets the final outcome.</li>
        </ul>
      </Section>

      <Section title="Show Cause workflow">
        <p>This is the manager-initiated concern process. Stages:</p>
        <Step n={1} title="Manager flags a concern">Show Cause tab → <em>+ Flag Concern</em>. Pick employee, type, describe the pattern (be specific &amp; factual with dates), optionally schedule the meeting. Employee + HR are notified.</Step>
        <Step n={2} title="Meeting held → log outcome">Manager clicks <em>Log meeting outcome</em> with what was discussed and any commitments.</Step>
        <Step n={3} title="If pattern persists → escalate to HR">Click <em>Escalate to HR</em> with reasoning. HR is notified.</Step>
        <Step n={4} title="HR issues the formal Show Cause">HR reviews, sets a response deadline, and clicks <em>Issue formal Show Cause</em>. The description auto-fills from the manager&apos;s flag + escalation reason. Employee gets a Show Cause notification.</Step>
        <Step n={5} title="Employee responds in writing">Employee opens their Show Cause → <em>Submit my response</em>. Response is logged.</Step>
        <Step n={6} title="HR resolves or escalates">Either <em>Accept response &amp; resolve</em>, or <em>Escalate to PIP</em> with an action plan.</Step>
        <Tip>
          Each card has a 6-dot progress bar — green = done, blue = current. Detail dialog shows a timeline of every event.
        </Tip>
      </Section>

      <Section title="PIP (Performance Improvement Plan)">
        <p>For more serious or persistent concerns. PIPs have measurable goals, a duration (typically 30/60/90 days), weekly check-ins with the manager, and a defined exit criteria. Created by HR after Show Cause escalation.</p>
      </Section>
    </>
  )
}

function JourneysGuide() {
  return (
    <>
      <Section title="Onboarding &amp; Offboarding Journeys">
        <p>Sidebar → <em>Onboarding / Offboarding</em>. A unified workflow engine that drives every new joiner and every leaver through the right tasks, in the right order, with the right docs.</p>
      </Section>

      <Section title="Onboarding (when someone joins)">
        <Step n={1} title="HR starts the journey">After hiring, click <em>Start Onboarding</em>. Pick employee. System auto-creates ~18 tasks across phases: Pre-Day 1, Day 1, Week 1, 30/60 day check-ins, and Probation End (90 days).</Step>
        <Step n={2} title="Auto-queue Offer Letter email">When you start the journey, an Offer Letter email is queued in the Email Approval Queue (Permanent / Probation variant or Training / Internship variant, picked from the employee type). HR reviews + sends.</Step>
        <Step n={3} title="Each task has an owner">HR / Manager / IT / Finance / Employee / Buddy. Tasks are color-coded so you can see at a glance what&apos;s blocking.</Step>
        <Step n={4} title="Generate documents from each task">Tasks like &quot;Issue Offer Letter&quot;, &quot;Sign Employment Agreement&quot;, &quot;Sign NDA&quot; have a ✨ <em>Generate document</em> button — auto-fills with employee data, opens print-ready HTML, optional <em>Save copy</em> to the employee&apos;s Documents tab.</Step>
        <Step n={5} title="Tick off as completed">Each task has a checkbox. Only the assigned role can tick it (HR sees all; the employee can tick only their tasks).</Step>
        <Step n={6} title="Probation confirmation">When the 90-day &quot;Issue confirmation letter&quot; task is marked complete, a Confirmation email auto-queues for HR review &amp; send.</Step>
      </Section>

      <Section title="Offboarding (when someone leaves)">
        <Step n={1} title="HR starts the journey">Sidebar → Onboarding / Offboarding → Offboarding tab → <em>Start Offboarding</em>. Pick employee, reason (Resignation / Termination Performance / Termination Misconduct / Mutual / Retirement / Layoff / End of Contract), notice period days, last working day.</Step>
        <Step n={2} title="Tasks generated by reason">~12–17 tasks across Notice → Last Day → Post-Departure phases. Reason filters which tasks apply (e.g. Show Cause + Termination Letter only fire for termination reasons; Notice Period Letter is universal).</Step>
        <Step n={3} title="Auto-queue email">Termination email (for termination reasons) or Notice Period email (resignation/mutual) is auto-queued for HR review.</Step>
        <Step n={4} title="Standard documents auto-generate">Show Cause Notice, Notice Period Letter, Termination Letter, Exit Clearance Form, Exit Interview Form, Experience Letter — all from one click each, auto-filled.</Step>
        <Step n={5} title="Last day = clear the desk">IT collects laptop &amp; ID, revokes system access, Manager confirms knowledge transfer, HR conducts the exit interview.</Step>
        <Step n={6} title="Post-departure">Finance processes F&amp;F within 30 days. HR updates HRIS status to SEPARATED + alumni eligibility flag.</Step>
      </Section>

      <Section title="Each role sees a different view">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>HR</strong> — all active journeys, can create + tick any task</li>
          <li><strong>Manager</strong> — their joiner / their leaver, can tick Manager / Buddy tasks</li>
          <li><strong>Employee</strong> — their own journey, can tick Employee tasks (forms to fill, docs to submit, NDA to acknowledge)</li>
        </ul>
      </Section>
    </>
  )
}

function EmailQueueGuide() {
  return (
    <>
      <Section title="Email Approval Queue (HR only)">
        <p>Sidebar → <em>Email Queue</em>. Every outgoing HR email is drafted, reviewed, and sent from this one place. Nothing goes out without HR review.</p>
      </Section>

      <Section title="How drafts get created">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Auto</strong>: When an onboarding starts (Offer Letter email), offboarding starts (Notice Period or Termination), or probation confirmation task completes (Confirmation email)</li>
          <li><strong>Manual</strong>: Click <em>Compose Email</em> at the top of the queue. Pick a template + employee, or write a custom email from scratch</li>
        </ul>
      </Section>

      <Section title="Workflow">
        <Step n={1} title="Open the queue">Drafts tab shows everything pending. Each card shows subject, recipient, trigger label, and timestamp.</Step>
        <Step n={2} title="Click a draft to review">Opens a Gmail-style preview with To / Cc / Bcc / Subject / Body all visible. The body is fully personalised with the employee&apos;s data.</Step>
        <Step n={3} title="Edit if needed">Click <em>Edit</em> to change any field. Body is HTML — edit inline.</Step>
        <Step n={4} title="Approve &amp; Send">Sends via Gmail SMTP. Status flips to SENT with timestamp.</Step>
        <Step n={5} title="Or Reject">If the draft is wrong / no longer needed, click Reject. Goes to the Rejected pile (audit kept).</Step>
      </Section>

      <Section title="Gmail SMTP setup (one-time)">
        <p>To send real emails:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Sign in to <Kbd>hr@convertt.co</Kbd> in Gmail.</li>
          <li>Google Account → Security → App passwords → generate one for &quot;Mail&quot;.</li>
          <li>Add to <Kbd>.env</Kbd>:</li>
        </ol>
        <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono overflow-x-auto">{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=hr@convertt.co
SMTP_PASS=<16-char-app-password>
SMTP_FROM="Convertt HR <hr@convertt.co>"`}</pre>
        <p>Restart the dev server. The amber banner becomes green ("Gmail SMTP is configured") and Approve &amp; Send fires immediately.</p>
        <Warn>
          Without SMTP configured, drafts are queued but never actually sent. The queue is the audit trail.
        </Warn>
      </Section>

      <Section title="Templates available">
        <ul className="list-disc pl-5 space-y-1">
          <li>Offer Letter — Permanent / Probation</li>
          <li>Offer Letter — Training / Internship</li>
          <li>Confirmation of Employment</li>
          <li>Notice Period Confirmation</li>
          <li>Termination of Employment</li>
          <li>Experience Letter</li>
          <li>Custom (free-form)</li>
        </ul>
        <p>Every template body matches the Convertt house style from the HR Gmail templates — joining date, probation period, compensation, timings, working days, office location, required documents.</p>
      </Section>
    </>
  )
}

function DocumentsGuide() {
  return (
    <>
      <Section title="Two kinds of documents">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Personal documents</strong> — saved against an employee (e.g. Offer Letter, NDA, Agreement, Experience Letter). Visible on People → [employee] → Documents tab.</li>
          <li><strong>Policies</strong> — company-wide. See the dedicated Policies module.</li>
        </ul>
      </Section>

      <Section title="Auto-generated documents">
        <p>Eleven document types auto-generate from employee data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Offer Letter (role-specific)</li>
          <li>Employment Agreement — Permanent / Probation</li>
          <li>Employment Agreement — Training / Internship</li>
          <li>NDA (Non-Disclosure Agreement)</li>
          <li>Show Cause Notice</li>
          <li>Notice Period Letter</li>
          <li>Termination Letter</li>
          <li>Experience Letter (calculates tenure)</li>
          <li>Confirmation Letter (after probation)</li>
          <li>Exit Clearance Form (multi-department sign-off)</li>
          <li>Exit Interview Form (blank fillable)</li>
        </ul>
        <p>All branded with Convertt Ltd letterhead, A4 print-ready, with signature blocks at the bottom.</p>
      </Section>

      <Section title="Generating a document">
        <Step n={1} title="Find the right journey task">Onboarding/Offboarding → expand a journey → look for tasks with a ✨ <em>Generate document</em> button.</Step>
        <Step n={2} title="Click it">For docs needing context (Show Cause concerns, Termination reason, last working day), a popup asks just those fields. NDA / Experience Letter generate instantly.</Step>
        <Step n={3} title="Preview or save">
          <ul className="list-disc pl-5">
            <li><em>Preview only</em> opens the personalised HTML in a new tab to review/print.</li>
            <li><em>Save &amp; open</em> records it permanently against the employee + opens the preview.</li>
          </ul>
        </Step>
        <Step n={4} title="Find saved copies later">People → [employee] → Documents tab. Every saved doc shows name, type, upload date, View link. Re-opens with identical content forever (the URL encodes the original params).</Step>
      </Section>

      <Section title="Total Rewards statement (Compensation tab)">
        <p>Every employee can download a Total Rewards Statement (or HR can for any employee). Includes current pay components, YTD gross/tax/net, and last 5 compensation changes. Branded, print-ready.</p>
      </Section>
    </>
  )
}

function PoliciesGuide() {
  return (
    <>
      <Section title="Policies module">
        <p>Sidebar → <em>Policies</em>. Versioned, audience-targeted policy documents with mandatory acknowledgment tracking.</p>
      </Section>

      <Section title="What HR can do">
        <Step n={1} title="New Policy">Click <em>+ New Policy</em>. Fill: title, category, type, version, description, content (markdown), optional attachment URL, effective date, audience (All / Managers only / HR only), and whether it requires acknowledgment.</Step>
        <Step n={2} title="Status flows DRAFT → PUBLISHED → ARCHIVED">New policies start as Draft. When ready, click the airplane ✈ icon to publish.</Step>
        <Step n={3} title="On publish">If <em>requiresAck</em> is on, the system creates a pending acknowledgment row for every employee in the audience and sends them a notification.</Step>
        <Step n={4} title="Track coverage">Each policy row shows a progress bar — signed / total. Click it to see the per-employee status (Signed with date, or Pending).</Step>
        <Step n={5} title="Archive">Replaces or supersedes the policy. Removes it from employee views; keeps the record for audit.</Step>
      </Section>

      <Section title="What employees see">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Pending tab</strong> — policies waiting for them to read &amp; acknowledge (alert banner at top).</li>
          <li><strong>Signed tab</strong> — policies they&apos;ve already acknowledged with date.</li>
          <li><strong>All Policies tab</strong> — everything in their audience.</li>
        </ul>
        <p>Clicking any policy opens it inline (markdown rendered). At the bottom: checkbox "I have read and understood…" + <strong>Acknowledge Policy</strong> button. Tick + click → done, signed forever.</p>
      </Section>
    </>
  )
}

function CompensationGuide() {
  return (
    <>
      <Section title="Compensation panel">
        <p>Open any employee → Compensation tab. Layout has four pieces:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Confidential banner</strong> — confirms who&apos;s viewing + offers Total Rewards download &amp; Request Compensation Change buttons</li>
          <li><strong>4 KPI tiles</strong> — Monthly Gross, Annual Gross, Last Change, Changes This Year</li>
          <li><strong>Pay Components</strong> — line-item breakdown (Basic, House Rent, Utilities, Food, Fuel, Medical, Other) with effective-from date</li>
          <li><strong>Compensation History</strong> — every change tagged (Annual Increment / Promotion / Bonus / Adjustment / Initial), before / after / delta / percentage / reason</li>
        </ul>
      </Section>

      <Section title="Access matrix">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>HR</strong> — view + edit any employee + Total Rewards download</li>
          <li><strong>Executive / Finance</strong> — view all + Total Rewards download (no edit)</li>
          <li><strong>Manager</strong> — view own + direct reports + Total Rewards download for those (no edit)</li>
          <li><strong>Employee</strong> — view own only + Total Rewards download (no edit)</li>
        </ul>
      </Section>

      <Section title="Compensation change flow">
        <Step n={1} title="HR opens the dialog">Click <em>Request Compensation Change</em>.</Step>
        <Step n={2} title="Three sections of the form">① Change Details (type / effective date / reason) ② Pay Components (quick +5% / +10% / +15% shortcuts or edit each line) ③ Review &amp; Confirm (before/after comparison + notification toggles).</Step>
        <Step n={3} title="Validation">Reason is mandatory on updates. Won&apos;t allow no-op saves.</Step>
        <Step n={4} title="Submit">Salary record updated, CompensationHistory row written, employee gets in-app + email notification (if toggled).</Step>
      </Section>

      <Section title="Total Rewards download">
        <p>Any role with view access can download a branded, print-ready statement. Includes:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Employee info block</li>
          <li>Current pay components + Monthly Gross + Annual Gross</li>
          <li>YTD KPIs: gross paid, income tax, EOBI, net pay</li>
          <li>Last 5 compensation changes with deltas</li>
        </ul>
      </Section>
    </>
  )
}

function HelpDeskGuide() {
  return (
    <>
      <Section title="Raising a ticket">
        <Step n={1} title="Sidebar → Help Desk → + New Ticket">Pick category (Payroll / Leave / Attendance / Policy / IT / Other), priority, subject, description.</Step>
        <Step n={2} title="Submit">HR sees the ticket in their inbox. You get notifications on every reply.</Step>
        <Step n={3} title="Track">Status moves OPEN → IN_PROGRESS → RESOLVED → CLOSED. Comments are threaded.</Step>
      </Section>

      <Section title="For HR — handling tickets">
        <ul className="list-disc pl-5 space-y-1">
          <li>Assign to an HR colleague using the assignee dropdown.</li>
          <li>Reply inline. Each reply notifies the employee.</li>
          <li>Mark Resolved with a resolution note. Employee can re-open within 7 days if it wasn&apos;t actually resolved.</li>
        </ul>
      </Section>

      <Section title="AI chatbot first">
        <Tip>
          Before raising a ticket, try the floating 💬 chat bubble bottom-right. The AI HR assistant can answer many common questions (leave balance, last payslip, policy details, etc.) instantly.
        </Tip>
      </Section>
    </>
  )
}

function SettingsGuide() {
  return (
    <>
      <Section title="Settings (HR only)">
        <p>Sidebar → <em>Settings</em>. One-time / occasional configuration.</p>
      </Section>

      <Section title="Company">
        <ul className="list-disc pl-5 space-y-1">
          <li>Company name (appears on all letters, payslips, emails)</li>
          <li>Office address (Convertt Ltd, Mega Tower, Gulberg, Lahore)</li>
          <li>Contact email + phone</li>
          <li>Working days &amp; hours defaults</li>
        </ul>
      </Section>

      <Section title="Departments">
        <p>10 canonical Convertt departments are seeded: HR / ADM / WBW / WBS / UIUX / BD / MDT / MRK / PCD / FIN. Add or rename as needed.</p>
      </Section>

      <Section title="Payroll configuration">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Late threshold</strong> — when clock-in counts as "after start" (recorded for HR; not surfaced as a status)</li>
          <li><strong>Overtime multiplier</strong> &amp; standard hours per day</li>
          <li><strong>EOBI toggle</strong> — on/off + employee rate + cap</li>
          <li><strong>Income tax toggle</strong> — on/off (currently off until you&apos;re ready)</li>
        </ul>
      </Section>

      <Section title="Leave policy">
        <p>Default allocations per employee type (Permanent: 12 Casual + 12 Sick, Internship: 1 Emergency, etc.). Editable per type.</p>
      </Section>

      <Section title="Clock-in security">
        <p>Attendance → 🛡 Clock-in Security Settings. Configure Allowed Locations + manage Trusted Devices. See the <strong>Attendance</strong> guide for details.</p>
      </Section>
    </>
  )
}

function RolesGuide() {
  return (
    <>
      <Section title="The four roles">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>EMPLOYEE</strong> — self-service. View own everything; edit limited self-service fields. Default for new joiners.</li>
          <li><strong>MANAGER</strong> — direct-reports management. Approve leaves, see team attendance, run performance reviews, flag Show Cause.</li>
          <li><strong>HR_ADMIN</strong> — full org access. Hire/terminate, run payroll, configure security, send emails, manage policies, issue Show Cause, edit compensation.</li>
          <li><strong>EXECUTIVE</strong> — strategic read-only across the org. Plus final approval on payroll runs.</li>
        </ul>
        <p>Optional add-on roles for some flows: <strong>FINANCE</strong> (payroll review + F&amp;F) and <strong>IT</strong> (equipment / system access tasks in journeys).</p>
      </Section>

      <Section title="A user can hold multiple roles">
        <p>Workday-style. Example: Tahreem can be HR_ADMIN + MANAGER + EMPLOYEE at the same time. The top-bar role switcher only shows the roles she actually holds.</p>
      </Section>

      <Section title="Assigning roles (HR)">
        <p>People → [employee] → System Roles panel (HR-only). Tick the boxes. The user can then switch between assigned views via the top-bar role pill.</p>
      </Section>

      <Section title="HR's preview mode">
        <p>Beyond &quot;assigned&quot; roles, HR can <em>preview</em> the app as any role for testing — see the <strong>Getting Started</strong> guide. The amber banner makes it obvious you&apos;re in preview; destructive actions are blocked.</p>
      </Section>

      <Section title="Permission rules at a glance">
        <ul className="list-disc pl-5 space-y-1">
          <li>Sensitive data (compensation, payslips, Show Cause details) is scoped by employee + manager-of-team + HR + Executive/Finance (where applicable).</li>
          <li>Mutating actions (approve / issue / send / edit) all check <em>currently-active</em> role, not just assigned roles. So previewing as Employee blocks HR-only actions.</li>
          <li>Server-side enforcement on every API route — UI hiding is convenience, not security.</li>
        </ul>
      </Section>
    </>
  )
}

// ─── REGISTRY ───────────────────────────────────────────────────────────────

export const GUIDES: Guide[] = [
  { slug: 'getting-started', title: 'Getting Started',   description: 'Welcome + first steps + role-based views',                          icon: Sparkles,        roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: GettingStarted },
  { slug: 'dashboard',       title: 'Dashboard',          description: 'Your home page changes based on your role',                         icon: LayoutDashboard, roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: DashboardGuide },
  { slug: 'people',          title: 'People & Compensation', description: 'Directory, profiles, edit manager, salary changes',           icon: Users,           roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: PeopleGuide },
  { slug: 'attendance',      title: 'Attendance & Time',   description: 'Clock-in, security, exceptions, overtime',                         icon: Clock,           roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: AttendanceGuide },
  { slug: 'leave',           title: 'Leave Management',    description: 'Request leave, approvals, balances',                                icon: CalendarDays,    roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: LeaveGuide },
  { slug: 'payroll',         title: 'Payroll & Payslips',  description: '8-stage approval chain, payslip PDFs',                              icon: Banknote,        roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: PayrollGuide },
  { slug: 'compensation',    title: 'Compensation',         description: 'Salary changes, Total Rewards, access matrix',                     icon: Award,           roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: CompensationGuide },
  { slug: 'performance',     title: 'Performance & Show Cause', description: 'Reviews, goals, Show Cause workflow, PIP',                  icon: TrendingUp,      roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: PerformanceGuide },
  { slug: 'journeys',        title: 'Onboarding & Offboarding', description: 'Joiner / leaver task workflows + auto-generated docs',        icon: UserPlus,        roles: ['HR_ADMIN','MANAGER','EMPLOYEE'],            Content: JourneysGuide },
  { slug: 'email-queue',     title: 'Email Queue',          description: 'Review &amp; send HR emails via Gmail SMTP',                       icon: Mail,            roles: ['HR_ADMIN'],                                  Content: EmailQueueGuide },
  { slug: 'documents',       title: 'Documents',            description: 'Auto-generated employee documents + Total Rewards',                icon: FolderOpen,      roles: ['HR_ADMIN','MANAGER','EMPLOYEE'],            Content: DocumentsGuide },
  { slug: 'policies',        title: 'Policies',             description: 'Publish, audience targeting, acknowledgment tracking',             icon: FolderOpen,      roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: PoliciesGuide },
  { slug: 'helpdesk',        title: 'Help Desk',            description: 'Raise tickets, AI chatbot, get help from HR',                      icon: LifeBuoy,        roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: HelpDeskGuide },
  { slug: 'settings',        title: 'Settings (HR)',        description: 'Company name, payroll config, leave policy, security',             icon: Settings,        roles: ['HR_ADMIN'],                                  Content: SettingsGuide },
  { slug: 'roles',           title: 'Roles & Permissions',  description: 'Who can do what · multi-role users · preview mode',                icon: ShieldCheck,     roles: ['HR_ADMIN','MANAGER','EMPLOYEE','EXECUTIVE'], Content: RolesGuide },
]

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug)
}

export function guidesForRole(role: string): Guide[] {
  return GUIDES.filter((g) => g.roles.includes(role as Guide['roles'][number]))
}

// re-export icon for the index page
export { Sparkles }
