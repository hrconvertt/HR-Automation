# Rules that exist only because HR is the only user

Right now one person operates this system. Of 44 accounts, **37 have never
logged in**, and the 7 that have were all last seen in mid-June 2026 — nearly
three months ago. So every route into the app that assumes an employee will do
something for themselves is, today, a dead end, and a number of deliberate
shortcuts were built to route around that.

They are shortcuts, not the design. This file lists them so that when employees
start using the system nobody has to go looking for what to undo.

Each entry says what it does, where it lives, and what should replace it.

---

## 1. HR files leave and WFH on anyone's behalf

**Where** `src/app/api/leave/route.ts` — only `HR_ADMIN` may pass an
`employeeId` other than their own. `src/app/dashboard/leave/_views/admin-leave-view.tsx`
— the employee picker, defaulting to "— Myself —".

**Why** Nobody else logs in, so a request that only the employee can raise is a
request that never exists. Every leave record in the system was typed by HR
from an email.

**Then** Employees raise their own. Keep the picker for HR, but as the exception
(someone off sick with no laptop) rather than the only path.

---

## 2. Requests are entered already approved

**Where** Practice, not code. The API still routes a new request through
`PENDING → PENDING_HR → APPROVED`. But when HR records something that was agreed
over email, it is written straight in as `APPROVED` with both approval stamps
back-dated to the dates on the thread.

**Why** The approval genuinely happened — in Gmail. Re-running it through the
queue would mean HR approving a request HR just typed.

**Then** The approval happens in the app, and the status means what it says.

---

## 3. Marking a cell **L** on the attendance grid creates the leave request

**Where** `src/lib/grid-leave.ts`, called from the manual-entry branch of
`src/app/api/attendance/route.ts`.

**Why** A day marked L existed only as a letter in a grid — invisible to
payroll, to the sandwich rule, and to the leave list. Ali Shan was marked L for
3 September with no request behind it on a day HR had already approved by email.

**Then** Reverse the direction: the approved request marks the grid, not the
other way round. The auto-created requests are identifiable — their reason ends
`[from attendance grid]`.

**Note** The type defaults to `CASUAL`, deliberately. Casual is *not* exempt from
the sandwich rule, so a Friday marked L still surfaces for HR to judge.
Defaulting to `SICK` would hand out an exemption the grid never claimed.

---

## 4. Payroll counts leave from the grid as well as from requests

**Where** `src/lib/payroll-leave.ts`, used by all three payroll routes.

**Why** Same reason as (3), before (3) existed. Payroll read approved
`LeaveRequest` rows only, so a day marked L was paid as a day worked.

**Then** Requests become the single source. Reading both is harmless once they
always agree, but it stops being necessary.

---

## 5. The sandwich rule reads grid-marked leave too

**Where** `src/app/api/sandwich/route.ts` — attendance-derived candidates,
deduplicated against requests.

**Why** Same gap. Altaf's Friday 28 August was a grid cell and nothing else, so
the rule could not see the absence it exists to assess.

**Then** As (4).

---

## 6. Attendance is typed, not clocked

**Where** The "Manual HR entry" branch at the end of `POST /api/attendance`.
The clock-in path, punches, device trust scoring and geofencing are all built
and all unused.

**Why** Nobody logs in to clock in.

**Then** Employees clock in; HR's manual entry becomes the correction path. The
conflict machinery for "punched on a day marked leave" already exists at
`/dashboard/time/conflicts` and starts earning its keep.

---

## 7. Approvers are named from a dropdown

**Where** `leadsOnly` / `hrOnly` filters on `GET /api/employees`; the approver
selects in the leave dialog.

**Why** The approval happened in email, so HR records *who* approved rather than
the system knowing because they clicked it.

**Then** The approver is whoever actioned it, and the field stops being editable.

---

## 8. Evidence reaches the system via HR's inbox

**Where** The Friday/Monday evidence rule in `src/lib/sandwich.ts`, enforced at
submission in `POST /api/leave`.

**Why** The employee emails a document to HR; HR attaches it to the record. The
rule is right either way, but today it means HR cannot file the request until
the employee has replied to an email.

**Then** The employee attaches it when they raise the request, which is what the
block is really asking for.

**Note** `LeaveRequest` holds **one** attachment. Rayyan sent two — the challan
and the certificate form. If two files become normal, this needs a real
attachments table.

---

## 9. Overtime approval is HR-only

**Where** `src/app/dashboard/attendance/_views/team-time-view.tsx` — the
manager-facing control is disabled with a note saying so; approvals go through
HR's Approvals tab.

**Then** Managers approve their own team's overtime.

---

## 10. Signed onboarding documents are a tick-box

**Where** `src/app/dashboard/journeys/journeys-client.tsx` — "Upload coming
soon — for now, tick the box once you've sent the signed copy to HR."

**Then** The employee uploads the signed copy and the tick follows the file.

---

## 11. The appraisal form's Appraisee column is filled by HR

**Where** `src/app/dashboard/performance/appraisals/_components/appraisal-form-editor.tsx`
— both scoring columns are editable by the same person.

**Why** The paper form has the employee self-rate. With no employee logins, HR
transcribes it.

**Then** The employee fills their column and the appraiser cannot see it until
they have filled theirs — which is the point of having two columns.

---

## 12. Nothing is actually emailed

**Where** No `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` in the environment.

**Evidence** The `EmailSend` table is empty. **0 of 358 payslips** are marked
sent. Every "email" the app composes is downloaded and sent by hand from Gmail.

**Why** Not a deliberate shortcut — an unset credential. But it is the reason
several flows end at "Generate" rather than "Send", and it belongs on this list
because it shapes how the app is used.

**Then** Set the three variables in Vercel. This one can be fixed today and does
not need to wait for employees.
