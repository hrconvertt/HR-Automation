/**
 * Learning paths — the shared vocabulary, safe to import on either side.
 *
 * The server-side access check lives in learning-paths.ts, which reads the
 * database and so must never be pulled into a client bundle.
 */

export const PATH_VISIBILITY = ['PRIVATE', 'EVERYONE'] as const
export type PathVisibility = (typeof PATH_VISIBILITY)[number]

export const VISIBILITY_LABEL: Record<PathVisibility, string> = {
  PRIVATE: 'Only me',
  EVERYONE: 'Everyone',
}

export const VISIBILITY_HINT: Record<PathVisibility, string> = {
  PRIVATE: 'Just for you',
  EVERYONE: 'Anyone at Convertt can open it',
}

/** A path as a card shows it. */
export interface PathSummary {
  id: string
  title: string
  visibility: string
  items: number
  mine: boolean
  /** Who made it, when it is not yours. */
  owner: string | null
  /** The first few courses, for the cover mosaic. */
  covers: { id: string; title: string; type: string }[]
}
