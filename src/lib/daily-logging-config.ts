/**
 * Daily-Logging dynamic configuration.
 *
 * Everything HR can tune from /dashboard/settings/daily-logging lives
 * here, persisted as a single JSON blob under Config(key=CONFIG_KEY).
 * No business rule should be hardcoded — read from this helper.
 *
 *  - softCutoffHour      after this hour, today's log shows "Missing" on
 *                        the lead dashboard (24h clock, 0–23). Default 23.
 *  - taskCategories      populates the EOD form's category dropdown.
 *  - inquiryTemplates    "Quick reasons" chips on the Ask Why dialog.
 *  - analyticsVisibility per-role toggles for who can view analytics.
 *  - statusOptions       enum-ish list of allowed daily-log task statuses.
 */
import { prisma } from '@/lib/prisma'

export const CONFIG_KEY = 'daily_logging'

export type AnalyticsRole = 'EMPLOYEE' | 'LEAD' | 'MANAGER' | 'HR_ADMIN' | 'EXECUTIVE'

export interface DailyLoggingConfig {
  softCutoffHour: number
  taskCategories: string[]
  inquiryTemplates: string[]
  statusOptions: string[]
  analyticsVisibility: Record<AnalyticsRole, boolean>
}

export const DEFAULT_CONFIG: DailyLoggingConfig = {
  softCutoffHour: 23,
  taskCategories: [
    'Development',
    'Design',
    'QA',
    'Client',
    'Meeting',
    'Admin',
    'Research',
    'Other',
  ],
  inquiryTemplates: [
    'Why did this take longer than expected?',
    'Why was the KPI missed?',
    'What was the blocker on this?',
    'Can you share more context on this task?',
    'How can we help unblock you?',
  ],
  statusOptions: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'],
  analyticsVisibility: {
    EMPLOYEE: false,
    LEAD: true,
    MANAGER: true,
    HR_ADMIN: true,
    EXECUTIVE: true,
  },
}

/**
 * Merge stored config (may be partial / from older schema) over defaults,
 * so adding a new knob never breaks existing rows.
 */
function merge(stored: Partial<DailyLoggingConfig> | null): DailyLoggingConfig {
  if (!stored) return DEFAULT_CONFIG
  return {
    softCutoffHour:
      typeof stored.softCutoffHour === 'number' && stored.softCutoffHour >= 0 && stored.softCutoffHour <= 23
        ? stored.softCutoffHour
        : DEFAULT_CONFIG.softCutoffHour,
    taskCategories: Array.isArray(stored.taskCategories) && stored.taskCategories.length
      ? stored.taskCategories
      : DEFAULT_CONFIG.taskCategories,
    inquiryTemplates: Array.isArray(stored.inquiryTemplates) && stored.inquiryTemplates.length
      ? stored.inquiryTemplates
      : DEFAULT_CONFIG.inquiryTemplates,
    statusOptions: Array.isArray(stored.statusOptions) && stored.statusOptions.length
      ? stored.statusOptions
      : DEFAULT_CONFIG.statusOptions,
    analyticsVisibility: {
      ...DEFAULT_CONFIG.analyticsVisibility,
      ...(stored.analyticsVisibility ?? {}),
    },
  }
}

export async function getDailyLoggingConfig(): Promise<DailyLoggingConfig> {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  if (!row) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(row.value) as Partial<DailyLoggingConfig>
    return merge(parsed)
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function setDailyLoggingConfig(
  next: Partial<DailyLoggingConfig>,
): Promise<DailyLoggingConfig> {
  const current = await getDailyLoggingConfig()
  const merged = merge({ ...current, ...next })
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(merged) },
    create: { key: CONFIG_KEY, value: JSON.stringify(merged) },
  })
  return merged
}

export function canSeeAnalytics(
  cfg: DailyLoggingConfig,
  role: string,
  isOwnRecord: boolean,
): boolean {
  // HR + EXEC always see (subject to their config toggle off explicitly)
  const r = role as AnalyticsRole
  if (r === 'HR_ADMIN' || r === 'EXECUTIVE' || r === 'MANAGER' || r === 'LEAD') {
    return cfg.analyticsVisibility[r] !== false
  }
  if (r === 'EMPLOYEE') {
    return isOwnRecord && cfg.analyticsVisibility.EMPLOYEE === true
  }
  return false
}

/** Returns the calendar day (midnight UTC) for the given timestamp. */
export function dayUtc(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}
