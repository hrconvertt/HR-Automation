import { prisma } from '@/lib/prisma'
import { DirectorySearch } from './directory-search'

interface Props {
  employeeId: string
}

/**
 * Employee directory — public-safe view (active people, no PII).
 * The "People" page title comes from employees/layout.tsx, so no banner here.
 * DirectorySearch renders its own card-grid with an embedded search.
 */
export async function EmployeeDirectoryView({ employeeId }: Props) {
  const employees = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      // Skip people HR has explicitly hidden from the directory.
      // HR / Manager / self can still see them in their own views — this
      // filter only applies to the Employee-role directory.
      hideFromDirectory: false,
    },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      designation: true,
      photoUrl: true,
      department: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
  })

  return (
    <DirectorySearch
      currentUserId={employeeId}
      employees={employees.map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        email: e.email,
        designation: e.designation,
        department: e.department?.name ?? '—',
      }))}
    />
  )
}
