/**
 * The Team Absence Calendar folded into the main Calendar — leave, WFH and LOA
 * now show there alongside holidays, birthdays, events and probation ends, so
 * there is one calendar rather than two. This redirect keeps old links working.
 */
import { redirect } from 'next/navigation'

export default function AttendanceCalendarRedirect() {
  redirect('/dashboard/calendar')
}
