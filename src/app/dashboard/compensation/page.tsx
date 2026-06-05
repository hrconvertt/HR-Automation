import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'

async function getData() {
  const [bands, history] = await Promise.all([
    prisma.salaryBand.findMany({
      orderBy: { minSalary: 'asc' },
      include: { position: { select: { title: true, level: true } } },
    }),
    prisma.compensationHistory.findMany({
      orderBy: { effectiveDate: 'desc' },
      take: 20,
      include: { employee: { select: { fullName: true, employeeCode: true } } },
    }),
  ])
  return { bands, history }
}

export default async function CompensationPage() {
  const { bands, history } = await getData()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Compensation</h1>

      {/* Salary Bands */}
      <Card>
        <CardHeader><CardTitle>Salary Bands</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Position</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Min Salary</TableHead>
              <TableHead>Max Salary</TableHead>
              <TableHead>Currency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bands.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">No salary bands defined.</TableCell></TableRow>
            ) : (
              bands.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.position?.title ?? '—'}</TableCell>
                  <TableCell><Badge variant="default">{b.position?.level ?? '—'}</Badge></TableCell>
                  <TableCell>{formatCurrency(b.minSalary)}</TableCell>
                  <TableCell>{formatCurrency(b.maxSalary)}</TableCell>
                  <TableCell>{b.currency}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Compensation History */}
      <Card>
        <CardHeader><CardTitle>Compensation History</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Effective Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Previous Salary</TableHead>
              <TableHead>New Salary</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400">No compensation history.</TableCell></TableRow>
            ) : (
              history.map((h) => {
                const pct = h.incrementPct ?? ((h.newSalary - h.oldSalary) / h.oldSalary * 100).toFixed(1)
                return (
                  <TableRow key={h.id}>
                    <TableCell>
                      <p className="font-medium">{h.employee.fullName}</p>
                      <p className="text-xs text-gray-400">{h.employee.employeeCode}</p>
                    </TableCell>
                    <TableCell>{formatDate(h.effectiveDate)}</TableCell>
                    <TableCell><Badge variant="secondary">{h.type}</Badge></TableCell>
                    <TableCell>{formatCurrency(h.oldSalary)}</TableCell>
                    <TableCell>{formatCurrency(h.newSalary)}</TableCell>
                    <TableCell>
                      <span className={h.newSalary >= h.oldSalary ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        +{pct}%
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-500 max-w-[180px] truncate">{h.reason ?? '—'}</TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
