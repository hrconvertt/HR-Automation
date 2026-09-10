/**
 * The live pipeline as one ring — part-to-whole at a glance, nothing more.
 *
 * A donut earns its place only for part-to-whole at a glance and only up to
 * six segments; five stages are drawn, and the comparison anybody actually
 * makes happens in the labelled counts beside it, not by eye on the arcs. That
 * row is also what discharges the palette's contrast relief rule: two of these
 * hues sit under 3:1 on a white surface, so each is direct-labelled rather
 * than left to carry meaning alone.
 *
 * Rejected is not a segment. A rejected candidate has left the pipeline, and
 * on this data they are five of seven — the ring would mostly be the people
 * Convertt said no to, and the centre number would mean nothing useful. It is
 * counted beside the ring instead. Keeping it out also keeps red away from
 * green: the two hues that would carry the most meaning are the pair
 * red-green vision cannot separate, and they would have been neighbours.
 *
 * Hues are the validated categorical order, assigned to stages in fixed
 * sequence and never recycled — a stage keeps its colour when the counts move,
 * including when a count falls to zero.
 */

/** Categorical slots, in order, validated as a set against the light surface. */
export const STAGE_COLORS: Record<string, string> = {
  APPLIED: '#2a78d6',
  SCREENING: '#eb6834',
  INTERVIEW: '#1baf7a',
  OFFER: '#eda100',
  HIRED: '#008300',
  // Outside the ring, and neutral so it never competes with a live stage.
  REJECTED: '#94a3b8',
}

/** The stages the ring draws, in pipeline order. */
export const RING_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED']

const SIZE = 176
const R = 70
const STROKE = 22
const C = 2 * Math.PI * R
/** A surface-coloured gap between arcs, so neighbouring hues never touch. */
const GAP = 2

interface Arc {
  key: string
  label: string
  count: number
  len: number
  offset: number
  full: number
}

export function StageDonut({ stages, inPipeline }: {
  stages: { key: string; label: string; count: number }[]
  inPipeline: number
}) {
  const ring = stages.filter((s) => RING_STAGES.includes(s.key))
  const drawn = inPipeline > 0 ? ring.filter((s) => s.count > 0) : []
  const cx = SIZE / 2

  // Each arc starts where every arc before it ended. The running total is a
  // reduce rather than a counter the map mutates — that would be a write
  // during render.
  const arcs = drawn.reduce<Arc[]>((acc, s) => {
    const prev = acc[acc.length - 1]
    const offset = prev ? prev.offset + prev.full : 0
    const full = (s.count / inPipeline) * C
    // One segment filling the ring needs no gap cut into it.
    const len = drawn.length === 1 ? full : Math.max(1, full - GAP)
    return [...acc, { key: s.key, label: s.label, count: s.count, len, offset, full }]
  }, [])

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={
        inPipeline === 0
          ? 'Nobody is in the pipeline'
          : `${inPipeline} in the pipeline: ${ring.map((s) => `${s.count} ${s.label}`).join(', ')}`
      }
      className="flex-shrink-0"
    >
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        {/* The track. Also the whole ring when nothing is in the pipeline. */}
        <circle
          cx={cx} cy={cx} r={R} fill="none"
          stroke="#e2e8f0" strokeWidth={STROKE}
        />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={cx} cy={cx} r={R} fill="none"
            stroke={STAGE_COLORS[a.key] ?? '#94a3b8'}
            strokeWidth={STROKE}
            strokeDasharray={`${a.len} ${C - a.len}`}
            strokeDashoffset={-a.offset}
          >
            <title>{`${a.label}: ${a.count} of ${inPipeline}`}</title>
          </circle>
        ))}
      </g>
      <text
        x={cx} y={cx - 4}
        textAnchor="middle" dominantBaseline="middle"
        className="fill-slate-900"
        style={{ fontSize: 34, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
      >
        {inPipeline}
      </text>
      <text
        x={cx} y={cx + 20}
        textAnchor="middle" dominantBaseline="middle"
        className="fill-slate-500"
        style={{ fontSize: 11 }}
      >
        in pipeline
      </text>
    </svg>
  )
}
