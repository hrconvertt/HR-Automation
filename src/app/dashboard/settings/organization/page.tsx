'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function OrganizationSettingsPage() {
  const [companyName, setCompanyName] = useState('Convertt Technologies Pvt Ltd')
  const [companyAddress, setCompanyAddress] = useState('')
  const [companyNtn, setCompanyNtn] = useState('')
  const [companyEobi, setCompanyEobi] = useState('')
  const [companySessi, setCompanySessi] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (d.config?.companyName) setCompanyName(d.config.companyName)
      if (d.config?.companyAddress) setCompanyAddress(d.config.companyAddress)
      if (d.config?.companyNtn) setCompanyNtn(d.config.companyNtn)
      if (d.config?.companyEobi) setCompanyEobi(d.config.companyEobi)
      if (d.config?.companySessi) setCompanySessi(d.config.companySessi)
    }).catch(() => {})
  }, [])

  async function save() {
    await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, companyAddress, companyNtn, companyEobi, companySessi }),
    })
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card>
      <CardHeader className="border-b border-slate-100"><CardTitle>Organization</CardTitle></CardHeader>
      <CardContent className="p-6 space-y-5 max-w-xl">
        <Field label="Company Name" hint="Shown on letters, payslips, and exports.">
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </Field>
        <Field label="Registered Address">
          <textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)}
            rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="NTN (FBR)" hint="National Tax Number">
            <Input value={companyNtn} onChange={(e) => setCompanyNtn(e.target.value)} placeholder="0000000-0" />
          </Field>
          <Field label="EOBI Reg. No." hint="Employer registration">
            <Input value={companyEobi} onChange={(e) => setCompanyEobi(e.target.value)} />
          </Field>
        </div>
        <Field label="SESSI Reg. No." hint="Sindh Employees' Social Security (optional, provincial)">
          <Input value={companySessi} onChange={(e) => setCompanySessi(e.target.value)} />
        </Field>
        <div>
          <Button onClick={save}>{saved ? 'Saved' : 'Save Organization'}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
