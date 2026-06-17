'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Plus, MessageSquare } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Ticket {
  id: string
  ticketId: string
  subject: string
  category: string
  priority: string
  status: string
  createdAt: string
  employee: { fullName: string; employeeCode: string }
  _count?: { replies: number }
}

const priorityVariant: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  URGENT: 'destructive',
  HIGH: 'warning',
  MEDIUM: 'default',
  LOW: 'secondary',
}

const statusVariant: Record<string, 'success' | 'default' | 'warning' | 'secondary'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'default',
  RESOLVED: 'success',
  CLOSED: 'secondary',
}

export default function HelpDeskPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [openDialog, setOpenDialog] = useState(false)
  const [form, setForm] = useState({ subject: '', category: 'GENERAL', priority: 'MEDIUM', description: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/helpdesk')
    const data = await res.json()
    setTickets(data.tickets ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  async function handleCreate() {
    setFormError('')
    setSaving(true)
    const res = await fetch('/api/helpdesk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setFormError(data.error || 'Failed'); return }
    setOpenDialog(false)
    setForm({ subject: '', category: 'GENERAL', priority: 'MEDIUM', description: '' })
    fetchTickets()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Help Desk</h1>
        <Button onClick={() => setOpenDialog(true)}>
          <Plus className="w-4 h-4" />
          New Ticket
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((s) => {
          const count = tickets.filter((t) => t.status === s).length
          return (
            <Card key={s}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">{s.replace('_', ' ')}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Tickets Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket #</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Replies</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">Loading…</TableCell></TableRow>
            ) : tickets.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-400">No tickets yet.</TableCell></TableRow>
            ) : (
              tickets.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.ticketId.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">{t.subject}</TableCell>
                  <TableCell>
                    <p className="text-sm">{t.employee.fullName}</p>
                    <p className="text-xs text-gray-400">{t.employee.employeeCode}</p>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{t.category}</Badge></TableCell>
                  <TableCell><Badge variant={priorityVariant[t.priority] ?? 'secondary'}>{t.priority}</Badge></TableCell>
                  <TableCell><Badge variant={statusVariant[t.status] ?? 'secondary'}>{t.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-gray-500">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span className="text-xs">{t._count?.replies ?? 0}</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(t.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* New Ticket Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Open New Ticket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief description of the issue" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAYROLL">Payroll</SelectItem>
                    <SelectItem value="LEAVE">Leave</SelectItem>
                    <SelectItem value="ATTENDANCE">Attendance</SelectItem>
                    <SelectItem value="POLICY">Policy</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="GENERAL">General</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-700"
                placeholder="Describe your issue in detail…"
              />
            </div>
            {formError && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded p-2">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Ticket'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
