import { prisma } from '@/lib/prisma'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus } from 'lucide-react'

async function getData() {
  const [assets, assignments] = await Promise.all([
    prisma.asset.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.assetAssignment.findMany({
      where: { returnedDate: null },
      orderBy: { assignedDate: 'desc' },
      include: {
        asset: true,
        employee: { select: { fullName: true, employeeCode: true } },
      },
    }),
  ])
  return { assets, assignments }
}

const statusVariant: Record<string, 'success' | 'default' | 'warning' | 'destructive'> = {
  AVAILABLE: 'success',
  ASSIGNED: 'default',
  MAINTENANCE: 'warning',
  DISPOSED: 'destructive',
}

export default async function AssetsPage() {
  const { assets, assignments } = await getData()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Assets</h1>
        <Button><Plus className="w-4 h-4" />Add Asset</Button>
      </div>

      {/* Asset Inventory */}
      <Card>
        <CardHeader><CardTitle>Asset Inventory ({assets.length})</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Brand / Model</TableHead>
              <TableHead>Serial No</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">No assets in inventory.</TableCell></TableRow>
            ) : (
              assets.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><Badge variant="secondary">{a.type}</Badge></TableCell>
                  <TableCell>{[a.brand, a.model].filter(Boolean).join(' / ') || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{a.serialNo ?? '—'}</TableCell>
                  <TableCell>{a.value ? formatCurrency(a.value) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[a.status] ?? 'secondary'}>{a.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Active Assignments */}
      <Card>
        <CardHeader><CardTitle>Active Assignments</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Assigned Date</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">No active assignments.</TableCell></TableRow>
            ) : (
              assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.asset.name}</p>
                    <p className="text-xs text-gray-400">{a.asset.type}</p>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{a.employee.fullName}</p>
                    <p className="text-xs text-gray-400">{a.employee.employeeCode}</p>
                  </TableCell>
                  <TableCell>{formatDate(a.assignedDate)}</TableCell>
                  <TableCell>{a.condition ?? '—'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline">Return</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
