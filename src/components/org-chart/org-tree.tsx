'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, RefreshCw, AlertTriangle } from 'lucide-react'
import OrgNodeCard from './org-node'

export interface OrgNode {
  id: string
  fullName: string
  employeeCode: string
  designation: string
  department: string | null
  departmentId: string | null
  photoUrl: string | null
  reportingManagerId: string | null
  directReports: number
  warning?: string
  isVirtual?: boolean
  children: OrgNode[]
}

interface ApiResponse {
  tree: OrgNode
  roots: number
  totalActive: number
  departments: { id: string; name: string }[]
  canEdit: boolean
}

const NODE_WIDTH = 200
const NODE_HEIGHT = 110
const H_GAP = 28
const V_GAP = 70

interface Positioned {
  node: OrgNode
  x: number
  y: number
  width: number
  depth: number
}

// Layout: compute subtree widths, then place left-to-right, centered above children.
function layout(root: OrgNode): { positioned: Positioned[]; width: number; height: number } {
  const subtreeWidth = new Map<string, number>()

  function measure(n: OrgNode): number {
    if (!n.children.length) {
      subtreeWidth.set(n.id, NODE_WIDTH)
      return NODE_WIDTH
    }
    let total = 0
    for (let i = 0; i < n.children.length; i++) {
      total += measure(n.children[i])
      if (i < n.children.length - 1) total += H_GAP
    }
    const w = Math.max(NODE_WIDTH, total)
    subtreeWidth.set(n.id, w)
    return w
  }
  measure(root)

  const positioned: Positioned[] = []
  let maxDepth = 0

  function place(n: OrgNode, left: number, depth: number) {
    const w = subtreeWidth.get(n.id) ?? NODE_WIDTH
    const cx = left + w / 2
    positioned.push({
      node: n,
      x: cx - NODE_WIDTH / 2,
      y: depth * (NODE_HEIGHT + V_GAP),
      width: NODE_WIDTH,
      depth,
    })
    maxDepth = Math.max(maxDepth, depth)
    let childLeft = left
    if (n.children.length) {
      // Center children block under node when wider than total subtree
      const childrenTotal = n.children.reduce(
        (s, c, i) => s + (subtreeWidth.get(c.id) ?? NODE_WIDTH) + (i < n.children.length - 1 ? H_GAP : 0),
        0,
      )
      childLeft = left + (w - childrenTotal) / 2
      for (const c of n.children) {
        place(c, childLeft, depth + 1)
        childLeft += (subtreeWidth.get(c.id) ?? NODE_WIDTH) + H_GAP
      }
    }
  }
  place(root, 0, 0)

  const width = subtreeWidth.get(root.id) ?? NODE_WIDTH
  const height = (maxDepth + 1) * NODE_HEIGHT + maxDepth * V_GAP
  return { positioned, width, height }
}

export default function OrgTree({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState<string>('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.9)
  const [reparenting, setReparenting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/org-chart', { cache: 'no-store' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${r.status}`)
      }
      const j = (await r.json()) as ApiResponse
      setData(j)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  const filteredTree = useMemo(() => {
    if (!data) return null
    const q = query.trim().toLowerCase()
    if (!q && !deptFilter) return data.tree
    // Mark nodes that match; keep ancestors. Don't prune actual structure,
    // just dim non-matching cards via CSS — that keeps the layout stable.
    return data.tree
  }, [data, query, deptFilter])

  const laidOut = useMemo(() => {
    if (!filteredTree) return null
    return layout(filteredTree)
  }, [filteredTree])

  const matchSet = useMemo(() => {
    if (!data) return null
    const q = query.trim().toLowerCase()
    if (!q && !deptFilter) return null
    const matches = new Set<string>()
    function walk(n: OrgNode) {
      const hitQuery =
        !q ||
        n.fullName.toLowerCase().includes(q) ||
        n.designation.toLowerCase().includes(q) ||
        n.employeeCode.toLowerCase().includes(q)
      const hitDept = !deptFilter || n.departmentId === deptFilter
      if (hitQuery && hitDept && !n.isVirtual) matches.add(n.id)
      n.children.forEach(walk)
    }
    walk(data.tree)
    return matches
  }, [data, query, deptFilter])

  async function handleDrop(employeeId: string, newManagerId: string) {
    if (!canEdit || employeeId === newManagerId) return
    setReparenting(true)
    try {
      const r = await fetch('/api/org-chart/reparent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, newManagerId }),
      })
      const j = await r.json()
      if (!r.ok) {
        alert(j.error ?? 'Failed to reparent')
      } else {
        await fetchTree()
      }
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setReparenting(false)
      setDragging(null)
      setDropTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">Loading org chart…</div>
    )
  }
  if (error) {
    return (
      <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    )
  }
  if (!data || !laidOut) return null

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, role, code…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400"
        >
          <option value="">All departments</option>
          {data.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
          >
            −
          </button>
          <span className="text-xs text-gray-500 w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
          >
            +
          </button>
          <button
            onClick={fetchTree}
            className="ml-2 p-1.5 text-gray-500 hover:bg-gray-100 rounded"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span>
          <strong className="text-gray-900">{data.totalActive}</strong> active employees
        </span>
        <span>·</span>
        <span>
          <strong className="text-gray-900">{data.roots}</strong> top-level
        </span>
        {canEdit && (
          <>
            <span>·</span>
            <span className="text-blue-600">HR can drag to reparent</span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-auto bg-slate-50 border border-gray-200 rounded-xl"
        style={{ maxHeight: '70vh' }}
      >
        <div
          style={{
            width: laidOut.width * zoom + 40,
            height: laidOut.height * zoom + 40,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            padding: 20,
            position: 'relative',
          }}
        >
          <svg
            width={laidOut.width + 40}
            height={laidOut.height + 40}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {laidOut.positioned.map((p) => {
              return p.node.children.map((c) => {
                const child = laidOut.positioned.find((q) => q.node.id === c.id)
                if (!child) return null
                const x1 = p.x + NODE_WIDTH / 2 + 20
                const y1 = p.y + NODE_HEIGHT + 20
                const x2 = child.x + NODE_WIDTH / 2 + 20
                const y2 = child.y + 20
                const midY = (y1 + y2) / 2
                return (
                  <path
                    key={`${p.node.id}-${c.id}`}
                    d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                    stroke="#cbd5e1"
                    strokeWidth={1.5}
                    fill="none"
                  />
                )
              })
            })}
          </svg>

          {laidOut.positioned.map((p) => (
            <div
              key={p.node.id}
              style={{
                position: 'absolute',
                left: p.x + 20,
                top: p.y + 20,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              }}
            >
              <OrgNodeCard
                node={p.node}
                canEdit={canEdit && !p.node.isVirtual}
                isDragging={dragging === p.node.id}
                isDropTarget={dropTarget === p.node.id}
                dimmed={matchSet ? !matchSet.has(p.node.id) : false}
                onDragStart={() => setDragging(p.node.id)}
                onDragEnd={() => {
                  setDragging(null)
                  setDropTarget(null)
                }}
                onDragOver={() => {
                  if (dragging && dragging !== p.node.id) setDropTarget(p.node.id)
                }}
                onDragLeave={() => {
                  if (dropTarget === p.node.id) setDropTarget(null)
                }}
                onDrop={(employeeId) => {
                  if (!p.node.isVirtual) handleDrop(employeeId, p.node.id)
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {reparenting && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          Updating reporting line…
        </div>
      )}
    </div>
  )
}
