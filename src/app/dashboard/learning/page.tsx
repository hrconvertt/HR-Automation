import { prisma } from '@/lib/prisma'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'

async function getData() {
  const [programs, records, certifications] = await Promise.all([
    prisma.trainingProgram.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.trainingRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        employee: { select: { fullName: true, employeeCode: true } },
        program: { select: { title: true } },
      },
    }),
    prisma.certification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])
  return { programs, records, certifications }
}

export default async function LearningPage() {
  const { programs, records, certifications } = await getData()

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Learning & Development</h1>

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="records">Training Records</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
        </TabsList>

        <TabsContent value="programs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Duration (hrs)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {programs.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-gray-400">No training programs.</TableCell></TableRow>
                ) : (
                  programs.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell><Badge variant="secondary">{p.type}</Badge></TableCell>
                      <TableCell>{p.provider ?? '—'}</TableCell>
                      <TableCell>{p.duration ? `${p.duration}h` : '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="records">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">No records.</TableCell></TableRow>
                ) : (
                  records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium">{r.employee.fullName}</p>
                        <p className="text-xs text-gray-400">{r.employee.employeeCode}</p>
                      </TableCell>
                      <TableCell>{r.program.title}</TableCell>
                      <TableCell>{formatDate(r.startDate)}</TableCell>
                      <TableCell>{r.endDate ? formatDate(r.endDate) : '—'}</TableCell>
                      <TableCell>{r.score ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'COMPLETED' ? 'success' : r.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>{r.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="certifications">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Certification</TableHead>
                  <TableHead>Issued By</TableHead>
                  <TableHead>Issued Date</TableHead>
                  <TableHead>Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certifications.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-400">No certifications.</TableCell></TableRow>
                ) : (
                  certifications.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs text-gray-500">{c.employeeId.slice(0, 8)}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.issuedBy}</TableCell>
                      <TableCell>{formatDate(c.issuedDate)}</TableCell>
                      <TableCell>
                        {c.expiryDate ? (
                          <span className={new Date(c.expiryDate) < new Date() ? 'text-slate-700 font-medium' : ''}>
                            {formatDate(c.expiryDate)}
                          </span>
                        ) : '—'}
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
