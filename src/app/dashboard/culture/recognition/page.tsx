import { loadCultureContext } from '../_lib/load-culture'
import { CultureClient } from '../culture-client'
import { CultureHeader } from '../_components/culture-header'

export default async function CultureRecognitionPage() {
  const { me, employees, kudos } = await loadCultureContext()
  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Recognize colleagues and celebrate great work." />
      <CultureClient
        mode="recognition"
        myEmployeeId={me.employee?.id ?? null}
        colleagues={employees
          .filter((e) => e.id !== me.employee?.id)
          .map((e) => ({ id: e.id, fullName: e.fullName, designation: e.designation }))}
        kudos={kudos.map((k) => ({
          id: k.id,
          message: k.message,
          category: k.category,
          createdAt: k.createdAt.toISOString(),
          from: k.from,
          to: k.to,
        }))}
      />
    </div>
  )
}
