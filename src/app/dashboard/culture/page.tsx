import { redirect } from 'next/navigation'

// People & Culture is now nested in the sidebar with 4 sub-routes:
//   /dashboard/culture/events  /recognition  /birthdays  /anniversaries
// The parent route redirects to Events as the default landing tab.
export default function CulturePage() {
  redirect('/dashboard/culture/events')
}
