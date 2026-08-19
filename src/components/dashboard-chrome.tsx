'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import RolePreviewSwitcher from '@/components/role-preview-switcher'
import { useState, useEffect } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Banknote,
  TrendingUp,
  Landmark,
  UserPlus,
  Briefcase,
  GraduationCap,
  Award,
  Shield,
  ShieldAlert,
  Package,
  LifeBuoy,
  BarChart3,
  PartyPopper,
  FolderOpen,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  PieChart,
  Inbox,
  ChevronDown,
  HelpCircle,
  Mail,
  ShieldCheck,
  Sprout,
  Heart,
  Sparkles,
  Network,
  CalendarCheck,
  MessageSquare,
  ClipboardList,
  CheckCircle2,
  Search,
  ArrowLeft,
  FileText,
  Banknote as BanknoteIcon,
  Plane as PlaneIcon,
  Mail as MailIcon,
  User as UserIcon,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import AIChatbot from '@/components/ai-chatbot'
import NotificationsBell from '@/components/notifications-bell'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles?: string[]
}
interface NavGroup {
  label: string
  items: NavItem[]
}

const FOCUS_MODE = process.env.NEXT_PUBLIC_FOCUS_MODE !== 'false'
const FOCUS_PATHS = new Set([
  '/dashboard',
  '/dashboard/time',
  '/dashboard/attendance',
  '/dashboard/leave',
  '/dashboard/leave/me',
  '/dashboard/leave/requests',
  '/dashboard/leave/approved',
  '/dashboard/leave/sandwich',
  '/dashboard/policies',
  '/dashboard/letters',
  '/dashboard/employees',
  '/dashboard/payroll',
  '/dashboard/recruiting',
  '/dashboard/onboarding',
  '/dashboard/lifecycle',
  '/dashboard/performance',
  '/dashboard/probation',
  '/dashboard/assets',
  '/dashboard/documents',
  '/dashboard/settings',
  '/dashboard/help',
  '/dashboard/admin/seed',
  '/dashboard/admin/health',
  '/dashboard/culture',
  '/dashboard/culture/overview',
  '/dashboard/culture/events',
  '/dashboard/culture/promotions',
  '/dashboard/culture/promotion-events',
  '/dashboard/culture/recognition',
  '/dashboard/culture/birthdays',
  '/dashboard/culture/anniversaries',
  '/dashboard/lifecycle/verification',
  '/dashboard/lifecycle/exit',
  '/dashboard/lifecycle/job-changes',
  '/dashboard/lifecycle/loa',
  '/dashboard/calendar',
  '/dashboard/org-chart',
  '/dashboard/settings/roles',
  '/dashboard/leadership-chat',
  '/dashboard/settings/daily-logging',
  '/dashboard/settings/bank-codes',
  '/dashboard/performance/appraisals',
  '/dashboard/performance/increments',
  '/dashboard/time/me',
  '/dashboard/time/everyone',
  '/dashboard/time/approvals',
  '/dashboard/time/conflicts',
  '/dashboard/attendance/calendar',
  '/dashboard/attendance/corrections',
])

function applyFocus(groups: NavGroup[]): NavGroup[] {
  if (!FOCUS_MODE) return groups
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => FOCUS_PATHS.has(i.href)) }))
    .filter((g) => g.items.length > 0)
}

const NAV_GROUPS_BY_ROLE: Record<string, NavGroup[]> = {
  HR_ADMIN: [
    {
      label: 'Core',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/employees', label: 'People', icon: Users },
        { href: '/dashboard/time', label: 'Time Tracking', icon: Clock },
        { href: '/dashboard/attendance', label: 'Attendance', icon: CalendarCheck },
        { href: '/dashboard/leave', label: 'Leave', icon: PlaneIcon },
        { href: '/dashboard/payroll', label: 'Payroll', icon: Banknote },
        { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
      ],
    },
    {
      label: 'Talent',
      items: [
        { href: '/dashboard/performance', label: 'Performance', icon: TrendingUp },
        { href: '/dashboard/lifecycle', label: 'Employee Lifecycle', icon: UserPlus },
        { href: '/dashboard/recruiting', label: 'Recruiting', icon: Briefcase },
        { href: '/dashboard/learning', label: 'Learning & Dev', icon: GraduationCap },
        { href: '/dashboard/org-chart', label: 'Org Chart', icon: Network },
      ],
    },
    {
      label: 'Finance & Admin',
      items: [
        { href: '/dashboard/compensation', label: 'Compensation', icon: Award },
        { href: '/dashboard/compliance', label: 'Compliance', icon: Shield },
        { href: '/dashboard/assets', label: 'Assets', icon: Package },
      ],
    },
    {
      label: 'Support & Admin',
      items: [
        { href: '/dashboard/culture', label: 'People & Culture', icon: Sparkles },
        { href: '/dashboard/documents', label: 'Document Center', icon: FolderOpen },
        { href: '/dashboard/email-queue', label: 'Email Queue', icon: Mail },
        { href: '/dashboard/helpdesk', label: 'Help Desk', icon: LifeBuoy },
        { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
        { href: '/dashboard/settings', label: 'Settings', icon: Settings },
        { href: '/dashboard/help', label: 'Help Center', icon: HelpCircle },
      ],
    },
    {
      label: 'Developer',
      items: [
        { href: '/dashboard/admin/seed', label: 'Demo Data', icon: Sprout },
        { href: '/dashboard/admin/health', label: 'System Health', icon: Heart },
      ],
    },
  ],

  MANAGER: [
    {
      label: 'My Team',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/employees', label: 'Team Members', icon: Users },
        { href: '/dashboard/time', label: 'Time Tracking', icon: Clock },
        { href: '/dashboard/attendance', label: 'Attendance', icon: CalendarCheck },
        { href: '/dashboard/leave', label: 'Leave', icon: PlaneIcon },
        { href: '/dashboard/performance', label: 'Team Performance', icon: TrendingUp },
        { href: '/dashboard/probation', label: 'Probation', icon: ShieldCheck },
      { href: '/dashboard/probation/tracker', label: 'Probation Tracker', icon: ClipboardList },
      ],
    },
    {
      label: 'My Workspace',
      items: [
        { href: '/dashboard/payroll', label: 'My Payslips', icon: Banknote },
        { href: '/dashboard/learning', label: 'Learning', icon: GraduationCap },
        { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/dashboard/culture', label: 'People & Culture', icon: Sparkles },
        { href: '/dashboard/documents', label: 'Document Center', icon: FolderOpen },
      ],
    },
    {
      label: 'Support',
      items: [
        { href: '/dashboard/helpdesk', label: 'Help Desk', icon: LifeBuoy },
        { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],

  EMPLOYEE: [
    {
      label: 'My Workspace',
      items: [
        { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
        { href: '/dashboard/time', label: 'Time Tracking', icon: Clock },
        { href: '/dashboard/attendance', label: 'Attendance', icon: CalendarCheck },
        { href: '/dashboard/leave', label: 'Leave', icon: PlaneIcon },
        { href: '/dashboard/payroll', label: 'My Payslips', icon: Banknote },
        { href: '/dashboard/employees', label: 'Directory', icon: Users },
        { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
      ],
    },
    {
      label: 'My Growth',
      items: [
        { href: '/dashboard/performance', label: 'My Reviews', icon: TrendingUp },
        { href: '/dashboard/learning', label: 'My Learning', icon: GraduationCap },
        { href: '/dashboard/culture', label: 'People & Culture', icon: Sparkles },
      ],
    },
    {
      label: 'Support',
      items: [
        { href: '/dashboard/documents', label: 'Document Center', icon: FolderOpen },
        { href: '/dashboard/helpdesk', label: 'Help Desk', icon: LifeBuoy },
        { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],

  LEAD: [
    {
      label: 'My Team',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/employees', label: 'My Team', icon: Users },
        { href: '/dashboard/time', label: 'Time Tracking', icon: Clock },
        { href: '/dashboard/attendance', label: 'Attendance', icon: CalendarCheck },
        { href: '/dashboard/leave', label: 'Leave', icon: PlaneIcon },
      ],
    },
    {
      label: 'My Workspace',
      items: [
        { href: '/dashboard/payroll', label: 'My Payslips', icon: Banknote },
        { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/dashboard/documents', label: 'Document Center', icon: FolderOpen },
      ],
    },
    {
      label: 'Support',
      items: [
        { href: '/dashboard/helpdesk', label: 'Help Desk', icon: LifeBuoy },
        { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],

  FINANCE: [
    {
      label: 'Finance',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/payroll', label: 'Payroll', icon: Banknote },
        { href: '/dashboard/compensation', label: 'Compensation', icon: Award },
        { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
      ],
    },
    {
      label: 'Support',
      items: [
        { href: '/dashboard/documents', label: 'Document Center', icon: FolderOpen },
        { href: '/dashboard/helpdesk', label: 'Help Desk', icon: LifeBuoy },
        { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],

  EXECUTIVE: [
    {
      label: 'Overview',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/reports', label: 'Workforce Analytics', icon: PieChart },
        { href: '/dashboard/time', label: 'Time Tracking', icon: Clock },
        { href: '/dashboard/attendance', label: 'Attendance', icon: CalendarCheck },
        { href: '/dashboard/leave', label: 'Leave', icon: PlaneIcon },
        { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/dashboard/culture', label: 'People & Culture', icon: Sparkles },
      ],
    },
    {
      label: 'Strategic',
      items: [
        { href: '/dashboard/employees', label: 'Workforce', icon: Users },
        { href: '/dashboard/compensation', label: 'Compensation', icon: Award },
        { href: '/dashboard/compliance', label: 'Compliance', icon: Shield },
        { href: '/dashboard/payroll', label: 'Payroll Overview', icon: Banknote },
        { href: '/dashboard/org-chart', label: 'Org Chart', icon: Network },
      ],
    },
    {
      label: 'Support',
      items: [
        { href: '/dashboard/documents', label: 'Document Center', icon: FolderOpen },
        { href: '/dashboard/helpdesk', label: 'Help Desk', icon: LifeBuoy },
        { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
}

// Nested sidebar groups — when the user is inside one of these paths,
// the sidebar shows a focused nested menu with a "Back" link.
/**
 * Employee Lifecycle module menu.
 *
 * Hoisted so the module's own routes — /dashboard/onboarding and
 * /dashboard/probation, which live outside the /dashboard/lifecycle path —
 * can register the SAME menu. The lookup below is a `startsWith` on the key,
 * so without their own entries those two pages matched no prefix, lost the
 * module sidebar, and dropped the user back to the main nav mid-module.
 */
const LIFECYCLE_NAV: NavGroup[] = [
  {
    label: 'Employee Lifecycle',
    items: [
      { href: '/dashboard/lifecycle', label: 'Overview', icon: Users },
      // Verification comes first because it comes first: a hire lands here the
      // moment the offer is accepted, and onboarding starts once the checks are
      // running. The sidebar reads in the order the lifecycle happens.
      { href: '/dashboard/lifecycle/verification', label: 'Background Verification', icon: ShieldCheck },
      { href: '/dashboard/onboarding', label: 'Onboarding', icon: UserPlus },
      // Probation lives INSIDE the lifecycle (its natural stage position).
      // The top-level HR nav entry was removed so it isn't duplicated;
      // Managers keep their top-level Probation entry (no lifecycle nav).
      { href: '/dashboard/probation', label: 'Probation', icon: ShieldCheck },
      { href: '/dashboard/lifecycle/job-changes', label: 'Job Changes', icon: TrendingUp },
      { href: '/dashboard/lifecycle/loa', label: 'Leave of Absence', icon: PlaneIcon },
      { href: '/dashboard/lifecycle/termination', label: 'Terminations', icon: ShieldAlert },
      { href: '/dashboard/lifecycle/exit', label: 'Exit Clearance', icon: LogOut },
    ],
  },
]

/**
 * Settings is a module, not one page: each area is its own route, so it gets a
 * sidebar like Employee Lifecycle rather than stacking every section under a
 * list on a single screen.
 */
const SETTINGS_NAV: NavGroup[] = [
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/settings', label: 'Overview', icon: Settings },
      { href: '/dashboard/settings/organization', label: 'Organization', icon: Network },
      { href: '/dashboard/settings/working-days', label: 'Working Days & Hours', icon: CalendarCheck },
      { href: '/dashboard/settings/leave-policies', label: 'Leave Policies', icon: PlaneIcon },
      { href: '/dashboard/settings/departments', label: 'Departments', icon: Users },
      { href: '/dashboard/settings/payroll-config', label: 'Payroll Configuration', icon: Banknote },
      // The bank list payroll codes against — was a hardcoded map until now.
      { href: '/dashboard/settings/bank-codes', label: 'Bank Codes', icon: Landmark, roles: ['HR_ADMIN', 'EXECUTIVE'] },
      { href: '/dashboard/settings/email-templates', label: 'Email Templates', icon: MailIcon },
      { href: '/dashboard/settings/roles', label: 'Roles', icon: ShieldCheck },
      { href: '/dashboard/settings/daily-logging', label: 'Daily Logging', icon: ClipboardList },
      { href: '/dashboard/settings/users', label: 'Users', icon: UserIcon },
      { href: '/dashboard/settings/time-tracking', label: 'Time Tracking', icon: BarChart3 },
    ],
  },
]

/**
 * Recruiting had its module nav inside the content area, which cost a whole
 * column beside an already dense board. Moving it to the app sidebar matches
 * Settings and Employee Lifecycle and gives the pipeline the full width.
 */
const RECRUITING_NAV: NavGroup[] = [
  {
    label: 'Recruiting',
    items: [
      { href: '/dashboard/recruiting?tab=requests', label: 'Requests', icon: Inbox },
      { href: '/dashboard/recruiting?tab=requisitions', label: 'Job Requisitions', icon: FolderOpen },
      { href: '/dashboard/recruiting/job-post-spend', label: 'Job Post Payments', icon: BanknoteIcon, roles: ['HR_ADMIN', 'EXECUTIVE'] },
      { href: '/dashboard/recruiting?tab=pipeline', label: 'Pipeline', icon: BarChart3 },
      { href: '/dashboard/recruiting?tab=knockouts', label: 'Knockouts', icon: ShieldAlert },
      { href: '/dashboard/recruiting?tab=pool', label: 'Talent Pool', icon: Users },
      { href: '/dashboard/recruiting?tab=schedule', label: 'My Schedule', icon: CalendarCheck },
      { href: '/dashboard/recruiting/new-jd', label: 'New Job Description', icon: FileText },
      // Offers is not in the sidebar. The offer that matters is the employment
      // letter on the person's own profile, and a second empty board listing
      // "0 pending · 0 total" only invited the question of which was the real
      // one. The route still exists for anything linking to it.
      // The metrics used to sit above every view in this module. They belong
      // on one page of their own, which is this.
      { href: '/dashboard/recruiting/analytics', label: 'Analytics', icon: TrendingUp },
    ],
  },
]

/**
 * Letter types were eight chips wrapping above the table, competing with the
 * status chips for the same strip of screen. They are really eight views of one
 * list, so they belong in the sidebar like Settings and Recruiting.
 */
const LETTERS_NAV: NavGroup[] = [
  {
    label: 'Letters',
    items: [
      { href: '/dashboard/letters', label: 'All requests', icon: FileText },
      { href: '/dashboard/letters?type=EXPERIENCE', label: 'Experience Letter', icon: FileText },
      { href: '/dashboard/letters?type=SALARY_CERTIFICATE', label: 'Salary Certificate', icon: Banknote },
      { href: '/dashboard/letters?type=NOC_VISA', label: 'NOC for Visa', icon: PlaneIcon },
      { href: '/dashboard/letters?type=BONAFIDE', label: 'Employment Verification', icon: ShieldCheck },
      { href: '/dashboard/letters?type=RELIEVING', label: 'Relieving Letter', icon: LogOut },
      { href: '/dashboard/letters?type=CONFIRMATION', label: 'Confirmation Letter', icon: CheckCircle2 },
      { href: '/dashboard/letters?type=SERVICE_CERTIFICATE', label: 'Service Certificate', icon: FileText },
      { href: '/dashboard/letters?type=WARNING', label: 'Warning Letter', icon: ShieldAlert },
    ],
  },
]

const NESTED_NAV: Record<string, NavGroup[]> = {
  '/dashboard/performance': [
    {
      label: 'Performance',
      items: [
        { href: '/dashboard/performance', label: 'Overview', icon: TrendingUp },
        { href: '/dashboard/performance/increments', label: 'Increments', icon: BanknoteIcon, roles: ['HR_ADMIN', 'EXECUTIVE'] },
        { href: '/dashboard/performance/appraisals', label: 'Appraisal Forms', icon: ClipboardList },
        { href: '/dashboard/daily-log', label: 'Daily Log', icon: ClipboardList },
        { href: '/dashboard/daily-review', label: 'Team Review', icon: BarChart3 },
        { href: '/dashboard/culture', label: 'Recognition', icon: Sparkles },
      ],
    },
  ],
  '/dashboard/settings': SETTINGS_NAV,
  '/dashboard/letters': LETTERS_NAV,
  '/dashboard/recruiting': RECRUITING_NAV,
  '/dashboard/lifecycle': LIFECYCLE_NAV,
  // Same module, different path roots — keep the sidebar on screen.
  '/dashboard/onboarding': LIFECYCLE_NAV,
  '/dashboard/probation': LIFECYCLE_NAV,
  '/dashboard/culture': [
    {
      label: 'People & Culture',
      items: [
        { href: '/dashboard/culture/overview', label: 'Overview', icon: BarChart3 },
        { href: '/dashboard/culture/events', label: 'Events', icon: CalendarDays },
        { href: '/dashboard/culture/promotions', label: 'Promotions', icon: TrendingUp },
        { href: '/dashboard/culture/promotion-events', label: 'Promotion Events', icon: PartyPopper },
        { href: '/dashboard/culture/recognition', label: 'Recognition', icon: Heart },
        { href: '/dashboard/culture/birthdays', label: 'Birthdays', icon: Sparkles },
        { href: '/dashboard/culture/anniversaries', label: 'Anniversaries', icon: Award },
      ],
    },
  ],
  '/dashboard/attendance': [
    {
      label: 'Attendance',
      items: [
        { href: '/dashboard/attendance?view=grid', label: 'Grid View', icon: CalendarCheck },
        { href: '/dashboard/attendance?view=summary', label: 'Summary View', icon: BarChart3 },
        { href: '/dashboard/attendance/calendar', label: 'Calendar', icon: CalendarDays },
        {
          href: '/dashboard/attendance/corrections',
          label: 'Corrections',
          icon: Inbox,
          roles: ['HR_ADMIN'],
        },
      ],
    },
  ],
  '/dashboard/time': [
    {
      label: 'Time Tracking',
      items: [
        { href: '/dashboard/time/me', label: 'My Time', icon: User },
        {
          href: '/dashboard/time/everyone',
          label: 'Everyone',
          icon: Users,
          roles: ['HR_ADMIN', 'MANAGER', 'LEAD', 'EXECUTIVE'],
        },
        {
          href: '/dashboard/time/approvals',
          label: 'Approvals',
          icon: Inbox,
          roles: ['HR_ADMIN', 'MANAGER'],
        },
        // One entry. The overtime record already filters to Approved with a
        // chip on the page, so a second sidebar link to the same screen was
        // the same destination twice.
        { href: '/dashboard/time/overtime', label: 'Overtime', icon: Clock },
        {
          href: '/dashboard/time/conflicts',
          label: 'Conflicts',
          icon: ShieldAlert,
          roles: ['HR_ADMIN'],
        },
      ],
    },
  ],
  '/dashboard/payroll': [
    {
      label: 'Payroll',
      items: [
        { href: '/dashboard/payroll', label: 'Payroll Run', icon: Banknote },
        {
          href: '/dashboard/payroll/slips',
          label: 'Salary Slips',
          icon: FileText,
          roles: ['HR_ADMIN'],
        },
        { href: '/dashboard/payroll/register', label: 'Slip Register', icon: FolderOpen },
      ],
    },
  ],
  '/dashboard/leave': [
    {
      label: 'Leave',
      items: [
        { href: '/dashboard/leave/me', label: 'My Leave', icon: PlaneIcon },
        { href: '/dashboard/leave/requests', label: 'Leave Requests', icon: Inbox },
        { href: '/dashboard/leave/approved', label: 'Leave Approved', icon: CheckCircle2 },
        // A pay charge, not a balance charge — its own list for that reason.
        { href: '/dashboard/leave/sandwich', label: 'Sandwich Deductions', icon: BanknoteIcon, roles: ['HR_ADMIN', 'EXECUTIVE'] },
      ],
    },
    {
      label: 'Work From Home',
      items: [
        { href: '/dashboard/leave/wfh/requests', label: 'WFH Requests', icon: Inbox },
        { href: '/dashboard/leave/wfh/approved', label: 'WFH Approved', icon: CheckCircle2 },
      ],
    },
  ],
}

function getActiveNav(
  pathname: string,
  baseGroups: NavGroup[],
  role: string,
): { groups: NavGroup[]; nested: boolean } {
  // An employee profile's sections belong in the sidebar like every other
  // module's. They cannot be a static NESTED_NAV entry because the links carry
  // the employee's id, so the group is built from the path being viewed.
  const profile = pathname.match(/^\/dashboard\/employees\/([^/]+)$/)
  if (profile && profile[1] !== 'new') {
    const base = `/dashboard/employees/${profile[1]}`
    return {
      nested: true,
      groups: [{
        label: 'Employee',
        items: [
          { href: `${base}?tab=overview`, label: 'Overview', icon: User },
          { href: `${base}?tab=lifecycle`, label: 'Lifecycle', icon: UserPlus },
          { href: `${base}?tab=compensation`, label: 'Compensation', icon: Banknote },
          { href: `${base}?tab=leave`, label: 'Leave', icon: PlaneIcon },
          { href: `${base}?tab=documents`, label: 'Documents', icon: FolderOpen },
          { href: `${base}?tab=performance`, label: 'Performance', icon: TrendingUp },
          { href: `${base}?tab=assets`, label: 'Assets', icon: Package },
        ],
      }],
    }
  }

  for (const prefix of Object.keys(NESTED_NAV)) {
    if (pathname.startsWith(prefix)) {
      const filtered = NESTED_NAV[prefix]
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => !i.roles || i.roles.includes(role)),
        }))
        .filter((g) => g.items.length > 0)
      return { groups: filtered, nested: true }
    }
  }
  return { groups: baseGroups, nested: false }
}

interface SearchResultItem {
  type: 'employee' | 'payslip' | 'policy' | 'leave' | 'letter'
  id: string
  title: string
  subtitle?: string
  href: string
}

function SearchBar() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const wrapperRef = useState<HTMLDivElement | null>(null)
  const containerRef = useState<HTMLDivElement | null>(null)
  // Using plain refs via useState is awkward; use useRef-style with state setter
  // ↑ keep simple: manage via direct DOM querySelector below

  // Global Cmd/Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const el = document.getElementById('hr-search-wrapper')
      if (el && !el.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Debounced fetch
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`, {
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          setResults(data.results ?? [])
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open])

  // suppress unused
  void wrapperRef
  void containerRef

  function iconFor(type: SearchResultItem['type']) {
    if (type === 'employee') return <UserIcon className="w-4 h-4 text-slate-500" />
    if (type === 'payslip') return <BanknoteIcon className="w-4 h-4 text-slate-500" />
    if (type === 'policy') return <FileText className="w-4 h-4 text-slate-500" />
    if (type === 'leave') return <PlaneIcon className="w-4 h-4 text-slate-500" />
    if (type === 'letter') return <MailIcon className="w-4 h-4 text-slate-500" />
    return <Search className="w-4 h-4 text-slate-500" />
  }

  return (
    <div id="hr-search-wrapper" className="relative w-auto sm:w-[280px] max-w-full min-w-0">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Search"
          title="Search (Ctrl+K)"
        >
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 bg-white shadow-sm">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people, payslips, policies, leaves…"
              className="flex-1 outline-none text-sm bg-transparent"
            />
            <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
              Esc
            </kbd>
          </div>
          {(query.trim().length >= 2 || loading) && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-[400px] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg z-50">
              {loading && (
                <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
              )}
              {!loading && results.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-500">No results.</div>
              )}
              {!loading &&
                results.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    onClick={() => {
                      router.push(r.href)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="flex items-start gap-2 w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <div className="mt-0.5">{iconFor(r.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                      {r.subtitle && (
                        <p className="text-xs text-gray-500 truncate">{r.subtitle}</p>
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">
                      {r.type}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  role: string
  displayName: string
  email: string
  designation: string | null
  departmentName: string | null
  mustChangePass: boolean
  canUseLeadershipChat?: boolean
  children: React.ReactNode
}

export default function DashboardChrome({
  role,
  displayName,
  email,
  designation,
  departmentName,
  mustChangePass,
  canUseLeadershipChat = false,
  children,
}: Props) {
  const pathname = usePathname()
  // Tracked via an effect rather than useSearchParams: this component wraps
  // every dashboard route, and useSearchParams here would require a Suspense
  // boundary around the entire shell or fail the production build.
  const [currentTab, setCurrentTab] = useState<string | null>(null)
  useEffect(() => {
    setCurrentTab(new URLSearchParams(window.location.search).get('tab'))
  }, [pathname])
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(false)

  useEffect(() => {
    if (mustChangePass && pathname !== '/dashboard/settings/password') {
      router.replace('/dashboard/settings/password')
    }
  }, [mustChangePass, pathname, router])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hr_sidebar_hidden')
      if (saved === '1') setSidebarHidden(true)
    } catch {
      /* ignore */
    }
  }, [])

  function toggleSidebar() {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen((v) => !v)
    } else {
      setSidebarHidden((v) => {
        const next = !v
        try {
          localStorage.setItem('hr_sidebar_hidden', next ? '1' : '0')
        } catch {
          /* ignore */
        }
        return next
      })
    }
  }

  async function handleLogout() {
    // Clerk owns the session — clear it via Clerk's signOut().
    // We still hit /api/auth/logout for any legacy hr_preview_role cookie
    // cleanup; it's a no-op for the Clerk session itself.
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined' && (window as unknown as { Clerk?: { signOut: (opts?: { redirectUrl?: string }) => Promise<void> } }).Clerk) {
      await (window as unknown as { Clerk: { signOut: (opts?: { redirectUrl?: string }) => Promise<void> } }).Clerk.signOut({ redirectUrl: '/login' })
      return
    }
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    // Lifecycle views are tabs on one route (/dashboard/lifecycle?tab=probation),
    // so matching on pathname alone lit up Overview for every one of them —
    // Overview's href IS the bare pathname. Compare the tab when the link
    // carries one, and require the bare link to have no tab active.
    const [hrefPath, hrefQuery] = href.split('?')
    if (!pathname.startsWith(hrefPath)) return false
    const tabInHref = new URLSearchParams(hrefQuery ?? '').get('tab')
    if (tabInHref) return currentTab === tabInHref
    const siblingTabbed = pathname === hrefPath && currentTab
    return !siblingTabbed
  }

  const [chatUnread, setChatUnread] = useState(0)
  useEffect(() => {
    if (!canUseLeadershipChat) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/leadership-chat/unread-count', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setChatUnread(data.count ?? 0)
      } catch {
        /* ignore */
      }
    }
    void load()
    const id = setInterval(() => void load(), 30000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [canUseLeadershipChat])

  // Inject the Leadership Chat nav entry for eligible roles. It rides in the
  // first group of each role's nav so it's always visible above the fold.
  const baseGroups = NAV_GROUPS_BY_ROLE[role] ?? NAV_GROUPS_BY_ROLE.EMPLOYEE
  const navGroupsWithChat: NavGroup[] = canUseLeadershipChat
    ? baseGroups.map((g, idx) =>
        idx === 0
          ? {
              ...g,
              items: [
                ...g.items,
                { href: '/dashboard/leadership-chat', label: 'Leadership Chat', icon: MessageSquare },
              ],
            }
          : g,
      )
    : baseGroups
  const { groups: activeGroups, nested } = getActiveNav(pathname, navGroupsWithChat, role)
  const navGroups = nested ? activeGroups : applyFocus(activeGroups)

  const displayRole = (() => {
    if (role === 'HR_ADMIN') {
      const desig = designation ?? 'Head of People & Culture'
      return departmentName ? `${desig} · ${departmentName}` : desig
    }
    if (role === 'MANAGER') return 'Manager'
    if (role === 'LEAD') return designation ? `${designation} · Lead` : 'Lead'
    if (role === 'EXECUTIVE') return 'CEO / Executive'
    if (role === 'FINANCE') return 'Finance'
    return designation ?? 'Employee'
  })()

  const inboxCount = 0

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          bg-slate-800 flex flex-col
          transform transition-all duration-200
          shadow-xl lg:shadow-none
          ${sidebarHidden ? 'lg:w-0 lg:overflow-hidden' : 'lg:w-60'}
          w-60
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarHidden ? 'lg:-translate-x-full' : 'lg:translate-x-0'}
        `}
      >
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-700/60 flex-shrink-0">
          <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="text-white font-semibold text-[15px] tracking-tight">Convertt</span>
          <button
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {FOCUS_MODE && !nested && (
          <div className="mx-2 mt-3 mb-1 px-3 py-2 rounded-md bg-slate-500/10 border border-slate-500/30 text-slate-200 text-[10px] leading-snug">
            <p className="font-semibold uppercase tracking-wider">Focus Mode</p>
            <p className="mt-0.5 text-slate-100/80">
              Polishing Attendance, Leave, Policies, People &amp; Payroll. Other modules hidden.
            </p>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          {nested && (
            <Link
              href="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium text-slate-400 hover:text-white hover:bg-slate-700/40 transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              Back to main menu
            </Link>
          )}
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                {group.label}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium mb-0.5 transition-colors
                      ${
                        active
                          ? 'bg-slate-700/15 text-slate-100 border-l-2 border-slate-500 pl-[10px]'
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/40'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/dashboard/leadership-chat' && chatUnread > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-slate-500 text-white text-[10px] font-semibold">
                        {chatUnread > 9 ? '9+' : chatUnread}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-700/60 px-3 py-3 flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-8 h-8 bg-slate-500 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ring-2 ring-slate-700/40">
              {getInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{displayName}</p>
              <p className="text-slate-400 text-[11px] truncate">{displayRole}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-slate-300 transition-colors p-1 rounded-md hover:bg-slate-700/50"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 shadow-sm h-14 flex items-center gap-3 px-4 lg:px-6 flex-shrink-0">
          <button
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 -ml-1 p-1.5 rounded-md transition-colors"
            onClick={toggleSidebar}
            aria-label="Toggle navigation menu"
            title="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* View-as lives in the header so it is reachable from any screen —
              including one where the previewed role has lost the sidebar. */}
          <div className="ml-auto order-last">
            <RolePreviewSwitcher role={role} />
          </div>

          <Link
            href="/dashboard"
            className={`flex items-center gap-2 ${sidebarHidden ? 'lg:flex' : 'lg:hidden'}`}
          >
            <div className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">C</span>
            </div>
            <span className="text-gray-900 font-semibold text-[15px] tracking-tight">Convertt</span>
          </Link>

          <div className="flex-1" />

          <SearchBar />

          <div className="flex items-center gap-1.5">
            <Link
              href="/dashboard/inbox"
              className="relative p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Inbox"
              title="Inbox"
            >
              <Inbox className="w-5 h-5" />
              {inboxCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-slate-500 ring-2 ring-white" />
              )}
            </Link>

            <NotificationsBell />

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 ml-1 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Account menu"
                >
                  <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {getInitials(displayName)}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500 hidden sm:block" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-[220px] rounded-xl border border-gray-200 bg-white shadow-lg p-1.5 text-sm"
                >
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                    <p className="text-xs text-gray-500 truncate">{email}</p>
                  </div>
                  <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/dashboard/settings/profile"
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 outline-none cursor-pointer data-[highlighted]:bg-gray-100"
                    >
                      <User className="w-4 h-4 text-gray-500" />
                      My Profile &amp; Photo
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 outline-none cursor-pointer data-[highlighted]:bg-gray-100"
                    >
                      <Settings className="w-4 h-4 text-gray-500" />
                      Settings
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                  <DropdownMenu.Item
                    onSelect={handleLogout}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 outline-none cursor-pointer data-[highlighted]:bg-slate-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8">
            {/* Use the width that exists. Capped well above a typical monitor so
                ultrawide screens do not stretch prose to unreadable line lengths,
                but a 1920px display no longer loses ~320px a side to margin. */}
            <div className="w-full max-w-[1800px] mx-auto">{children}</div>
          </div>
        </main>
      </div>

      <AIChatbot />
    </div>
  )
}
