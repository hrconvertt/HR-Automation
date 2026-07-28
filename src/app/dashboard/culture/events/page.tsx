import { loadCultureContext } from '../_lib/load-culture'
import { CultureClient } from '../culture-client'
import { CultureHeader } from '../_components/culture-header'

export default async function CultureEventsPage() {
  const { isHR, upcomingEvents, pastEvents } = await loadCultureContext()
  return (
    <div className="space-y-5">
      <CultureHeader subtitle="Company events, retreats, and town halls." />
      <CultureClient
        mode="events"
        isHR={isHR}
        upcomingEvents={upcomingEvents.map((e) => ({ ...e, eventDate: e.eventDate.toISOString() }))}
        pastEvents={pastEvents.map((e) => ({ ...e, eventDate: e.eventDate.toISOString() }))}
      />
    </div>
  )
}
