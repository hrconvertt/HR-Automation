'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface Department { id: string; code: string; name: string }
interface Position { id: string; title: string; level: string }
interface LeavePolicy { id: string; leaveType: string; daysPerYear: number; employeeType: string; isCarryForward: boolean }

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export default function SettingsPage() {
  const [workingDays, setWorkingDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([])
  const [companyName, setCompanyName] = useState('Convertt Technologies Pvt Ltd')
  const [saved, setSaved] = useState(false)

  // Payroll calculation settings
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8)
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(2)
  const [lateThresholdHour, setLateThresholdHour] = useState(10)
  const [lateThresholdMinute, setLateThresholdMinute] = useState(15)
  const [eobiEnabled, setEobiEnabled] = useState(false)
  const [eobiEmployeeRate, setEobiEmployeeRate] = useState(1)   // stored as % for display
  const [eobiCap, setEobiCap] = useState(470)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [calcSaved, setCalcSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.departments) setDepartments(d.departments)
        if (d.positions) setPositions(d.positions)
        if (d.leavePolicies) setLeavePolicies(d.leavePolicies)
        if (d.config?.companyName) setCompanyName(d.config.companyName)
        if (d.config?.workingDays) setWorkingDays(JSON.parse(d.config.workingDays))
        if (d.config?.standardHoursPerDay) setStandardHoursPerDay(Number(d.config.standardHoursPerDay))
        if (d.config?.overtimeMultiplier) setOvertimeMultiplier(Number(d.config.overtimeMultiplier))
        if (d.config?.lateThresholdHour) setLateThresholdHour(Number(d.config.lateThresholdHour))
        if (d.config?.lateThresholdMinute) setLateThresholdMinute(Number(d.config.lateThresholdMinute))
        if (d.config?.eobiEmployeeRate) setEobiEmployeeRate(Number(d.config.eobiEmployeeRate) * 100)
        if (d.config?.eobiCap) setEobiCap(Number(d.config.eobiCap))
        if (d.config?.eobiEnabled !== undefined) setEobiEnabled(d.config.eobiEnabled === 'true')
        if (d.config?.taxEnabled !== undefined) setTaxEnabled(d.config.taxEnabled === 'true')
      })
  }, [])

  async function handleSaveGeneral() {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, workingDays }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleSaveCalculations() {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standardHoursPerDay,
        overtimeMultiplier,
        lateThresholdHour,
        lateThresholdMinute,
        eobiEnabled,
        eobiEmployeeRate: eobiEmployeeRate / 100,  // store as decimal
        eobiCap,
        taxEnabled,
      }),
    })
    setCalcSaved(true)
    setTimeout(() => setCalcSaved(false), 3000)
  }

  function toggleDay(day: string) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="workingdays">Working Days</TabsTrigger>
          <TabsTrigger value="calculations">Calculations</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="leavepolicy">Leave Policy</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
            <CardContent>
              <div className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </div>
                <Button onClick={handleSaveGeneral}>
                  {saved ? 'Saved!' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workingdays">
          <Card>
            <CardHeader><CardTitle>Working Days</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Select which days are considered working days.</p>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        workingDays.includes(day)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <Button onClick={handleSaveGeneral} className="mt-4">Save Working Days</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculations">
          <Card>
            <CardHeader><CardTitle>Payroll &amp; Attendance Calculations</CardTitle></CardHeader>
            <CardContent>
              <div className="max-w-lg space-y-5">

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Standard Hours / Day
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1} max={24} step={0.5}
                        value={standardHoursPerDay}
                        onChange={(e) => setStandardHoursPerDay(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-gray-500">hrs</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Used to calculate hourly rate &amp; overtime threshold</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Overtime Multiplier
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1} max={5} step={0.5}
                        value={overtimeMultiplier}
                        onChange={(e) => setOvertimeMultiplier(Number(e.target.value))}
                        className="w-24"
                      />
                      <span className="text-sm text-gray-500">× hourly rate</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Pakistan Factories Act default is 2×</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Late Arrival Threshold</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0} max={23}
                      value={lateThresholdHour}
                      onChange={(e) => setLateThresholdHour(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-500">:</span>
                    <Input
                      type="number"
                      min={0} max={59}
                      value={lateThresholdMinute}
                      onChange={(e) => setLateThresholdMinute(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-500">(24h format)</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Clock-in after this time is marked Late</p>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <p className="text-sm font-semibold text-gray-700">Statutory Deductions</p>

                  {/* EOBI toggle + settings */}
                  <div className={`rounded-lg border ${eobiEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-gray-50'} p-4`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">EOBI (Employee Old-Age Benefits)</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {eobiEnabled
                            ? 'Active — will be deducted from next payroll run'
                            : 'Disabled — no EOBI deduction will be applied'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eobiEnabled}
                          onChange={(e) => setEobiEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-checked:bg-blue-600 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                      </label>
                    </div>

                    <div className={`grid grid-cols-2 gap-4 transition-opacity ${eobiEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Employee Rate</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0} max={10} step={0.1}
                            value={eobiEmployeeRate}
                            onChange={(e) => setEobiEmployeeRate(Number(e.target.value))}
                            className="w-24"
                            disabled={!eobiEnabled}
                          />
                          <span className="text-sm text-gray-500">% of basic</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Currently 1% (PKR 130/month)</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Cap</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            value={eobiCap}
                            onChange={(e) => setEobiCap(Number(e.target.value))}
                            className="w-28"
                            disabled={!eobiEnabled}
                          />
                          <span className="text-sm text-gray-500">PKR</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Statutory cap: PKR 470</p>
                      </div>
                    </div>
                  </div>

                  {/* Income Tax toggle */}
                  <div className={`rounded-lg border ${taxEnabled ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-gray-50'} p-4`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Income Tax Withholding (FBR)</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {taxEnabled
                            ? 'Active — tax withheld using FBR 2025-26 slabs'
                            : 'Disabled — no income tax will be withheld'}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={taxEnabled}
                          onChange={(e) => setTaxEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-checked:bg-blue-600 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveCalculations}>
                  {calcSaved ? '✓ Saved' : 'Save Calculations'}
                </Button>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <strong>Note:</strong> Changes apply to the next payroll run. Already-generated payslips are not recalculated.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments">
          <Card>
            <CardHeader><CardTitle>Departments</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-8 text-gray-400">No departments.</TableCell></TableRow>
                ) : (
                  departments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell><Badge variant="secondary">{d.code}</Badge></TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="positions">
          <Card>
            <CardHeader><CardTitle>Positions</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-8 text-gray-400">No positions.</TableCell></TableRow>
                ) : (
                  positions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell><Badge variant="default">{p.level}</Badge></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="leavepolicy">
          <Card>
            <CardHeader><CardTitle>Leave Policies</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Employee Type</TableHead>
                  <TableHead>Days / Year</TableHead>
                  <TableHead>Carry Forward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leavePolicies.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-gray-400">No leave policies.</TableCell></TableRow>
                ) : (
                  leavePolicies.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.leaveType}</TableCell>
                      <TableCell><Badge variant="secondary">{p.employeeType}</Badge></TableCell>
                      <TableCell>{p.daysPerYear}</TableCell>
                      <TableCell>
                        <Badge variant={p.isCarryForward ? 'success' : 'secondary'}>
                          {p.isCarryForward ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
