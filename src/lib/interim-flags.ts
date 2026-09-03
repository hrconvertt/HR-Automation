/**
 * Reading and writing the interim-rule switches.
 *
 * Kept apart from interim-rules.ts, which is the catalogue and is safe to
 * import into a client component. This file touches the database.
 *
 * Absent means on. Every one of these rules is needed today, so a fresh
 * database with no Config rows behaves exactly as it does now; turning one off
 * is a deliberate act that leaves a row behind saying so.
 */
import { prisma } from '@/lib/prisma'
import { SWITCHABLE_RULES, DEFAULT_ENABLED } from '@/lib/interim-rules'

export async function interimEnabled(configKey: string): Promise<boolean> {
  const row = await prisma.config.findUnique({ where: { key: configKey } })
  if (!row) return DEFAULT_ENABLED
  return row.value !== 'off'
}

/** Every switch at once — for the settings screen. */
export async function allInterimFlags(): Promise<Record<string, boolean>> {
  const keys = SWITCHABLE_RULES.map((r) => r.configKey as string)
  const rows = await prisma.config.findMany({ where: { key: { in: keys } } })
  const set = new Map(rows.map((r) => [r.key, r.value !== 'off']))
  return Object.fromEntries(keys.map((k) => [k, set.get(k) ?? DEFAULT_ENABLED]))
}

export async function setInterimFlag(configKey: string, enabled: boolean): Promise<void> {
  await prisma.config.upsert({
    where: { key: configKey },
    update: { value: enabled ? 'on' : 'off' },
    create: { key: configKey, value: enabled ? 'on' : 'off' },
  })
}
