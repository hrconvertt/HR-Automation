'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Banknote,
  TrendingUp,
  UserPlus,
  Briefcase,
  GraduationCap,
  Award,
  Shield,
  Package,
  LifeBuoy,
  BarChart3,
  FolderOpen,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  PieChart,
  Search,
  Inbox,
  ChevronDown,
  HelpCircle,
  Mail,
  ShieldCheck,
  Sprout,
  Heart,
  FileText,
  Sparkles,
  CheckSquare,
} from 'lucide-react'
import { getInitials } from '@/lib/utils'
import AIChatbot from '@/components/ai-chatbot'
import NotificationsBell from '@/components/notifications-bell'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// ─── Focus mode ──────────────────────────────────────────────────────────────
// While we polish Attendance / Leave / Policies, hide the rest of the nav.
// Flip to `false` to show everything, or set NEXT_PUBLIC_FOCUS_MODE=false in .env.
const FOCUS_MODE = process.env.NEXT_PUBLIC_FOCUS_MODE !== 'false'
const FOCUS_PATHS = new Set([
  '/dashboard',
  '/dashboard/time',         // unified Time & Attendance module
  '/dashboard/attendance',   // legacy redirect — keep allowed so old bookmarks resolve
  '/dashboard/leave',        // legacy redirect — keep allowed so old bookmarks resolve
  '/dashboard/policies',
  '/dashboard/letters',      // Documents & Letters
  '/dashboard/employees',    // People
  '/dashboard/payroll',      // Payroll
  '/dashboard/recruiting',   // Hiring / Recruiting — now in active polishing
  '/dashboard/onboarding',   // Onboarding & Probation — now in active polishing
  '/dashboard/lifecycle',    // Unified Employee Lifecycle (onboarding + active + exit)
  '/dashboard/performance',  // Performance — Show Cause + PIP workflows
  '/dashboard/probation',    // Probation Tracker (Devsinc-style lifecycle)
  '/dashboard/assets',       // Assets module — typed inventory
  '/dashboard/documents',    // Documents — BYTEA upload + download
  '/dashboard/settings',     // Settings — Stripe/Linear-style redesign
  '/dashboard/help',
  '/dashboard/admin/seed',
  '/dashboard/admin/health',
  '/dashboard/culture',
  '/dashboard/calendar',
  '/dashboard/tasks',
])

function applyFocus(groups: NavGroup[]): NavGroup[] {
  if (!FOCUS_MODE) return groups
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => FOCUS_PATHS.has(i.href)) }))
    .filter((g) => g.items.length > 0)
}

// ─── Role-based sidebar definitions ─────────────────────────────────────────

const NAV_GROUPS_BY_ROLE: Record<string, NavGroup[]> = {
  HR_ADMIN: [
    {
      label: 'Core',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/employees', label: 'People', icon: Users },
        { href: '/dashboard/time', label: 'Time & Attendance', icon: Clock },
        { href: '/dashboard/payroll', label: 'Payroll', icon: Banknote },
        { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/dashboard/tasks', label: 'Tasks', icon: CheckSquare },
      ],
    },
    {
      label: 'Talent',
      items: [
        { href: '/dashboard/performance', label: 'Performance', icon: TrendingUp },
        { href: '/dashboard/lifecycle', label: 'Employee Lifecycle', icon: UserPlus },
        { href: '/dashboard/probation', label: 'Probation', icon: ShieldCheck },
        { href: '/dashboard/recruiting', label: 'Recruiting', icon: Briefcase },
        { href: '/dashboard/learning', label: 'Learning & Dev', icon: GraduationCap },
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
        { href: '/dashboard/time', label: 'Time & Attendance', icon: Clock },
        { href: '/dashboard/performance', label: 'Team Performance', icon: TrendingUp },
        { href: '/dashboard/probation', label: 'Probation', icon: ShieldCheck },
        { href: '/dashboard/tasks', label: 'Tasks', icon: CheckSquare },
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
        { href: '/dashboard/time', label: 'Time & Attendance', icon: Clock },
        { href: '/dashboard/payroll', label: 'My Payslips', icon: Banknote },
        { href: '/dashboard/employees', label: 'Directory', icon: Users },
        { href: '/dashboard/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/dashboard/tasks', label: 'Tasks', icon: CheckSquare },
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

  EXECUTIVE: [
    {
      label: 'Overview',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/reports', label: 'Workforce Analytics', icon: PieChart },
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

// View switcher removed — each user logs in as themselves with strict role.

interface CurrentUser {
  id: string
  email: string
  role: string
  roles?: string[]   // ← Multi-role
  mustChangePass?: boolean
  employee?: {
    id: string
    fullName: string
    photoUrl?: string | null
    designation?: string
    department?: { name: string } | null
  } | null
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Desktop collapse — persisted in localStorage so it survives reload
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user)
        // Force first-login password change — redirect everywhere except
        // the password page and the change-password API itself.
        if (d.user?.mustChangePass && pathname !== '/dashboard/settings/password') {
          router.replace('/dashboard/settings/password')
        }
      })
      .catch(() => {})
    // Clear any legacy preview-role cookie left from older builds
    if (typeof document !== 'undefined' && document.cookie.includes('hr_preview_role=')) {
      document.cookie = 'hr_preview_role=; path=/; max-age=0; SameSite=Lax'
    }
  }, [pathname, router])

  // Load + persist desktop sidebar collapsed state
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hr_sidebar_hidden')
      if (saved === '1') setSidebarHidden(true)
    } catch { /* ignore */ }
  }, [])
  function toggleSidebar() {
    // On mobile, toggle slide-in overlay; on desktop, toggle hidden state
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen((v) => !v)
    } else {
      setSidebarHidden((v) => {
        const next = !v
        try { localStorage.setItem('hr_sidebar_hidden', next ? '1' : '0') } catch { /* ignore */ }
        return next
      })
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const displayName = user?.employee?.fullName ?? user?.email ?? 'User'

  // ── Multi-role aware effective role ──
  // The "preview" cookie now switches views for ANY user with multiple roles.
  // If the user only has one role, the switcher hides itself.
  // Strict role enforcement — no preview switching. effectiveRole always = primary.
  const effectiveRole = user?.role ?? 'EMPLOYEE'

  const navGroups = applyFocus(NAV_GROUPS_BY_ROLE[effectiveRole] ?? NAV_GROUPS_BY_ROLE.EMPLOYEE)

  // For HR_ADMIN we prefer the actual designation ("Head of People & Culture")
  // joined with the department, so the sidebar/header doesn't say a generic "HR".
  const displayRole = (() => {
    if (effectiveRole === 'HR_ADMIN') {
      const desig = user?.employee?.designation ?? 'Head of People & Culture'
      const dept = user?.employee?.department?.name
      return dept ? `${desig} · ${dept}` : desig
    }
    if (effectiveRole === 'MANAGER')   return 'Manager'
    if (effectiveRole === 'EXECUTIVE') return 'Executive'
    return user?.employee?.designation ?? 'Employee'
  })()

  const inboxCount = 0

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
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
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-700/60 flex-shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
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

        {/* Focus-mode banner */}
        {FOCUS_MODE && (
          <div className="mx-2 mt-3 mb-1 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] leading-snug">
            <p className="font-semibold uppercase tracking-wider">Focus Mode</p>
            <p className="mt-0.5 text-amber-200/80">Polishing Attendance, Leave, Policies, People &amp; Payroll. Other modules hidden.</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
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
                      ${active
                        ? 'bg-blue-600/15 text-blue-100 border-l-2 border-blue-500 pl-[10px]'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/40'}
                    `}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-700/60 px-3 py-3 flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ring-2 ring-slate-700/40">
              {getInitials(displayName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{displayName}</p>
              <p className="text-slate-400 text-[11px] truncate">HRMS</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-slate-700/50"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header — white bar */}
        <header className="bg-white border-b border-gray-200 shadow-sm h-14 flex items-center gap-3 px-4 lg:px-6 flex-shrink-0">
          {/* Menu toggle — visible on all viewports */}
          <button
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-100 -ml-1 p-1.5 rounded-md transition-colors"
            onClick={toggleSidebar}
            aria-label="Toggle navigation menu"
            title="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo + wordmark — shown when sidebar is hidden (desktop) or on mobile */}
          <Link
            href="/dashboard"
            className={`flex items-center gap-2 ${sidebarHidden ? 'lg:flex' : 'lg:hidden'}`}
          >
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">C</span>
            </div>
            <span className="text-gray-900 font-semibold text-[15px] tracking-tight">Convertt</span>
          </Link>

          {/* Center: spacer — global search is not yet wired up. Each page
              has its own contextual search/filter. Avoid showing a fake
              input that misleads users. */}
          <div className="flex-1" />

          {/* Right cluster */}
          <div className="flex items-center gap-1.5">
            {/* Inbox link */}
            <Link
              href="/dashboard/inbox"
              className="relative p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Inbox"
              title="Inbox"
            >
              <Inbox className="w-5 h-5" />
              {inboxCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
              )}
            </Link>

            {/* Notifications — dropdown with unread badge */}
            <NotificationsBell />

            {/* Avatar dropdown */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 ml-1 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Account menu"
                >
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
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
                    <p className="text-xs text-gray-500 truncate">{user?.email ?? displayRole}</p>
                  </div>
                  <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 outline-none cursor-pointer data-[highlighted]:bg-gray-100"
                    >
                      <User className="w-4 h-4 text-gray-500" />
                      Profile
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
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 outline-none cursor-pointer data-[highlighted]:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">{children}</div>
          </div>
        </main>
      </div>

      {/* AI HR Assistant */}
      <AIChatbot />
    </div>
  )
}
