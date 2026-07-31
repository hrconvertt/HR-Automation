'use client'

/**
 * Offer letter builder — every term typed in, with the letter assembling live
 * beside the form.
 *
 * The existing generator builds an offer from an Employee row, which cannot
 * work here: an offer goes to a candidate who has not been hired, so there is
 * no employee record to read a designation or salary from. Everything is
 * entered instead, and nothing is inferred.
 *
 * The salary breakdown totals as you type rather than asking for a gross that
 * has to agree with its own parts — an offer letter whose components do not sum
 * to the stated gross is a dispute waiting to happen.
 *
 * Print rules are scoped to the letter, so Print / Save as PDF produces the
 * letter alone with no app chrome.
 */

import { useMemo, useState } from 'react'
import { Printer, RotateCcw } from 'lucide-react'

interface Dept { id: string; name: string }

const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 })

const COMPONENTS = [
  { key: 'basic', label: 'Basic Salary' },
  { key: 'houseRent', label: 'House Rent' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'food', label: 'Food Allowance' },
  { key: 'fuel', label: 'Fuel Allowance' },
  { key: 'medical', label: 'Medical Allowance' },
  { key: 'other', label: 'Other Allowance' },
] as const

type ComponentKey = (typeof COMPONENTS)[number]['key']

const EMPTY = {
  candidateName: '',
  fatherName: '',
  cnic: '',
  address: '',
  email: '',
  phone: '',
  position: '',
  department: '',
  employmentType: 'Permanent',
  reportingTo: '',
  joiningDate: '',
  workLocation: 'Office 201, 5th Floor, Mega Tower, Gulberg Main Boulevard, Lahore',
  workingHours: '10:00 AM – 7:00 PM, Monday to Friday',
  probation: 'Three (3) months from the date of joining',
  noticePeriod: 'One (1) month',
  leaveEntitlement: '14 annual leaves, 8 casual leaves and 8 sick leaves per year',
  offerDate: new Date().toISOString().slice(0, 10),
  responseBy: '',
  signatoryName: 'Tahreem Waheed',
  signatoryTitle: 'HR Associate — People Operations',
  notes: '',
}

export function OfferLetterBuilder({ departments }: { departments: Dept[] }) {
  const [f, setF] = useState({ ...EMPTY })
  const [pay, setPay] = useState<Record<ComponentKey, string>>({
    basic: '', houseRent: '', utilities: '', food: '', fuel: '', medical: '', other: '',
  })

  const set = (k: keyof typeof EMPTY) => (v: string) => setF((p) => ({ ...p, [k]: v }))

  const gross = useMemo(
    () => COMPONENTS.reduce((s, c) => s + (Number(pay[c.key]) || 0), 0),
    [pay],
  )

  const fmtDate = (iso: string) =>
    iso
      ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'long', year: 'numeric',
        })
      : '—'

  // Required before the letter is worth printing. Salary is included: an offer
  // without a figure is the one thing a candidate will always come back on.
  const missing = [
    !f.candidateName && 'candidate name',
    !f.position && 'position',
    !f.joiningDate && 'joining date',
    gross <= 0 && 'salary breakdown',
  ].filter(Boolean) as string[]

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5 items-start">
      {/* ---------------------------------------------------------------- form */}
      <div className="space-y-4 print-hide">
        <Section title="Candidate">
          <Field label="Full name" value={f.candidateName} onChange={set('candidateName')} required />
          <Field label="Father / husband name" value={f.fatherName} onChange={set('fatherName')} />
          <Field label="CNIC" value={f.cnic} onChange={set('cnic')} placeholder="00000-0000000-0" />
          <Field label="Email" value={f.email} onChange={set('email')} type="email" />
          <Field label="Phone" value={f.phone} onChange={set('phone')} />
          <Field label="Address" value={f.address} onChange={set('address')} textarea />
        </Section>

        <Section title="Role">
          <Field label="Position" value={f.position} onChange={set('position')} required />
          <SelectField
            label="Department"
            value={f.department}
            onChange={set('department')}
            options={['', ...departments.map((d) => d.name)]}
          />
          <SelectField
            label="Employment type"
            value={f.employmentType}
            onChange={set('employmentType')}
            options={['Permanent', 'Probation', 'Contract', 'Internship', 'Training']}
          />
          <Field label="Reporting to" value={f.reportingTo} onChange={set('reportingTo')} />
          <Field label="Joining date" value={f.joiningDate} onChange={set('joiningDate')} type="date" required />
          <Field label="Work location" value={f.workLocation} onChange={set('workLocation')} textarea />
          <Field label="Working hours" value={f.workingHours} onChange={set('workingHours')} />
        </Section>

        <Section title="Compensation" hint="Gross is the sum of the components — it is never typed separately.">
          {COMPONENTS.map((c) => (
            <Field
              key={c.key}
              label={c.label}
              value={pay[c.key]}
              onChange={(v) => setPay((p) => ({ ...p, [c.key]: v }))}
              type="number"
            />
          ))}
          <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-200">
            <span className="text-xs font-semibold text-slate-700">Gross monthly</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">PKR {money(gross)}</span>
          </div>
        </Section>

        <Section title="Terms">
          <Field label="Probation" value={f.probation} onChange={set('probation')} />
          <Field label="Notice period" value={f.noticePeriod} onChange={set('noticePeriod')} />
          <Field label="Leave entitlement" value={f.leaveEntitlement} onChange={set('leaveEntitlement')} textarea />
          <Field label="Offer date" value={f.offerDate} onChange={set('offerDate')} type="date" />
          <Field label="Respond by" value={f.responseBy} onChange={set('responseBy')} type="date" />
          <Field label="Additional notes" value={f.notes} onChange={set('notes')} textarea
            placeholder="Anything else that should appear in the letter" />
        </Section>

        <Section title="Signatory">
          <Field label="Name" value={f.signatoryName} onChange={set('signatoryName')} />
          <Field label="Title" value={f.signatoryTitle} onChange={set('signatoryTitle')} />
        </Section>

        <div className="flex items-center gap-2 pb-6">
          <button
            onClick={() => window.print()}
            disabled={missing.length > 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 text-white text-xs px-3 py-2 disabled:opacity-50"
            title={missing.length ? `Still needed: ${missing.join(', ')}` : 'Print or save as PDF'}
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
          </button>
          <button
            onClick={() => {
              setF({ ...EMPTY })
              setPay({ basic: '', houseRent: '', utilities: '', food: '', fuel: '', medical: '', other: '' })
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Clear
          </button>
          {missing.length > 0 && (
            <span className="text-[11px] text-amber-700">Still needed: {missing.join(', ')}</span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- preview */}
      <div>
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #offer-letter, #offer-letter * { visibility: visible !important; }
            #offer-letter {
              position: absolute; left: 0; top: 0; width: 100%;
              border: none !important; box-shadow: none !important; padding: 0 !important;
            }
            .print-hide { display: none !important; }
            @page { margin: 20mm; }
          }
        `}</style>

        <div
          id="offer-letter"
          className="bg-white border border-slate-200 rounded-xl p-10 text-[13px] leading-6 text-slate-900"
          style={{ fontFamily: 'Calibri, Carlito, sans-serif' }}
        >
          <div className="text-center mb-6">
            <div className="text-lg font-bold tracking-wide">CONVERTT LTD</div>
            <div className="text-[11px] text-slate-500">
              Office 201, 5th Floor, Mega Tower, Gulberg Main Boulevard, Lahore
            </div>
          </div>

          <div className="text-center text-base font-bold underline mb-6">LETTER OF OFFER</div>

          <p className="mb-1"><strong>Date:</strong> {fmtDate(f.offerDate)}</p>
          <p className="mb-4">
            <strong>{f.candidateName || '[Candidate Name]'}</strong>
            {f.fatherName && <><br />S/O — D/O {f.fatherName}</>}
            {f.cnic && <><br />CNIC: {f.cnic}</>}
            {f.address && <><br />{f.address}</>}
          </p>

          <p className="mb-3">Dear {f.candidateName || '[Candidate Name]'},</p>

          <p className="mb-3">
            We are pleased to offer you the position of <strong>{f.position || '[Position]'}</strong>
            {f.department && <> in the <strong>{f.department}</strong> department</>} at Convertt Ltd.
            Subject to your acceptance, the terms of your employment are set out below.
          </p>

          <table className="w-full border-collapse mb-4">
            <tbody>
              <Row k="Position" v={f.position} />
              <Row k="Department" v={f.department} />
              <Row k="Employment Type" v={f.employmentType} />
              <Row k="Reporting To" v={f.reportingTo} />
              <Row k="Date of Joining" v={f.joiningDate ? fmtDate(f.joiningDate) : ''} />
              <Row k="Work Location" v={f.workLocation} />
              <Row k="Working Hours" v={f.workingHours} />
              <Row k="Probation Period" v={f.probation} />
              <Row k="Notice Period" v={f.noticePeriod} />
              <Row k="Leave Entitlement" v={f.leaveEntitlement} />
            </tbody>
          </table>

          <p className="font-semibold mb-2">Compensation</p>
          <table className="w-full border-collapse mb-4">
            <tbody>
              {COMPONENTS.map((c) => (
                <tr key={c.key}>
                  <td className="border border-slate-300 px-2 py-1 w-1/2">{c.label}</td>
                  <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                    {Number(pay[c.key]) > 0 ? money(Number(pay[c.key])) : '—'}
                  </td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-slate-300 px-2 py-1">Gross Monthly Salary (PKR)</td>
                <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">
                  {gross > 0 ? money(gross) : '—'}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mb-3">
            All payments are subject to deduction of income tax and any other statutory
            deductions required under the laws of Pakistan.
          </p>

          <p className="mb-3">
            This offer is contingent upon successful verification of your credentials and
            references, and upon signing the Convertt Employment Agreement and
            Non-Disclosure Agreement on or before your date of joining.
          </p>

          {f.notes && <p className="mb-3">{f.notes}</p>}

          <p className="mb-6">
            Please confirm your acceptance by signing and returning a copy of this letter
            {f.responseBy && <> by <strong>{fmtDate(f.responseBy)}</strong></>}. We look
            forward to welcoming you to the team.
          </p>

          <div className="flex justify-between gap-8 mt-10">
            <div className="flex-1">
              <div className="border-t border-slate-400 pt-1 text-[12px]">For Convertt Ltd</div>
              <div className="font-semibold text-[12px] mt-1">{f.signatoryName || '—'}</div>
              <div className="text-[11px] text-slate-600">{f.signatoryTitle}</div>
            </div>
            <div className="flex-1">
              <div className="border-t border-slate-400 pt-1 text-[12px]">Accepted &amp; Agreed</div>
              <div className="font-semibold text-[12px] mt-1">{f.candidateName || '—'}</div>
              <div className="text-[11px] text-slate-600">Date: ______________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="border border-slate-300 px-2 py-1 w-1/3 font-medium">{k}</td>
      <td className="border border-slate-300 px-2 py-1">{v || '—'}</td>
    </tr>
  )
}

function Section({ title, hint, children }: {
  title: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', textarea, placeholder, required }: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  textarea?: boolean
  placeholder?: string
  required?: boolean
}) {
  const cls = 'w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-700'
  return (
    <label className="block">
      <span className="text-[11px] text-slate-500">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={`${cls} mt-1`} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${cls} mt-1`} />
      )}
    </label>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-700"
      >
        {options.map((o) => <option key={o} value={o}>{o || '— Select —'}</option>)}
      </select>
    </label>
  )
}
