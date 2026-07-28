/**
 * Position ladder â€” 10 ordered levels.
 *
 *   INTERN     â†’ JUNIOR     â†’ EXECUTIVE (entry-level professional)
 *   ASSOCIATE  â†’ SENIOR     â†’ LEAD
 *   MANAGER    â†’ HEAD       â†’ DIRECTOR  â†’ C_SUITE
 */

export const POSITION_LEVELS = [
  'INTERN',
  'JUNIOR',
  'EXECUTIVE',
  'ASSOCIATE',
  'SENIOR',
  'LEAD',
  'MANAGER',
  'HEAD',
  'DIRECTOR',
  'C_SUITE',
] as const

export type PositionLevel = (typeof POSITION_LEVELS)[number]

export const POSITION_LEVEL_LABELS: Record<string, string> = {
  INTERN: 'Intern',
  JUNIOR: 'Junior',
  EXECUTIVE: 'Executive',
  ASSOCIATE: 'Associate',
  SENIOR: 'Senior',
  LEAD: 'Lead',
  MANAGER: 'Manager',
  HEAD: 'Head',
  DIRECTOR: 'Director',
  C_SUITE: 'C-Suite',
}

export function positionLevelLabel(level: string | null | undefined): string {
  if (!level) return ''
  return POSITION_LEVEL_LABELS[level] ?? level
}

export function isValidPositionLevel(level: string): level is PositionLevel {
  return (POSITION_LEVELS as readonly string[]).includes(level)
}
