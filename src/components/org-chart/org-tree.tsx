'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, RefreshCw, AlertTriangle, Maximize2, Plus, Minus } from 'lucide-react'
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
  isPeer?: boolean
  children: OrgNode[]
}

interface ApiResponse {
  tree: OrgNode
  roots: number
  totalActive: number
  departments: { id: string; name: string }[]
  canEdit: boolean
}

// Card dimensions vary by mode — set at render time and threaded through layout.
type Mode = 'compact' | 'detailed'

interface Positioned {
  node: OrgNode
  x: number
  y: number
  width: number
  height: number
  depth: number
  // True for nodes that should render as peers of the root rather than as children
  // (i.e. drawn at depth 0 horizontally adjacent to the CEO with a dotted connector).
  isRootPeer?: boolean
}

interface Layout {
  positioned: Positioned[]
  width: number
  height: number
}

// Layout: walk the tree, compute subtree widths, then place left-to-right,
// centered above children. Root-level peers (Co-Founders) render at depth 0
// alongside the CEO with a dotted connector — handled separately at the top.
function layout(root: OrgNode, nodeW: number, nodeH: number, hGap: number, vGap: number): Layout {
  // Separate root peers from "true" children of the root so they don't get
  // drawn as a hierarchical edge below the CEO.
  const rootPeers = root.children.filter((c) => c.isPeer)
  const rootChildren = root.children.filter((c) => !c.isPeer)

  const realRoot: OrgNode = { ...root, children: rootChildren }

  const subtreeWidth = new Map<string, number>()

  function measure(n: OrgNode): number {
    if (!n.children.length) {
      subtreeWidth.set(n.id, nodeW)
      return nodeW
    }
    let total = 0
    for (let i = 0; i < n.children.length; i++) {
      total += measure(n.children[i])
      if (i < n.children.length - 1) total += hGap
    }
    const w = Math.max(nodeW, total)
    subtreeWidth.set(n.id, w)
    return w
  }
  measure(realRoot)

  const positioned: Positioned[] = []
  let maxDepth = 0

  function place(n: OrgNode, left: number, depth: number) {
    const w = subtreeWidth.get(n.id) ?? nodeW
    const cx = left + w / 2
    positioned.push({
      node: n,
      x: cx - nodeW / 2,
      y: depth * (nodeH + vGap),
      width: nodeW,
      height: nodeH,
      depth,
    })
    maxDepth = Math.max(maxDepth, depth)
    let childLeft = left
    if (n.children.length) {
      const childrenTotal = n.children.reduce(
        (s, c, i) => s + (subtreeWidth.get(c.id) ?? nodeW) + (i < n.children.length - 1 ? hGap : 0),
        0,
      )
      childLeft = left + (w - childrenTotal) / 2
      for (const c of n.children) {
        place(c, childLeft, depth + 1)
        childLeft += (subtreeWidth.get(c.id) ?? nodeW) + hGap
      }
    }
  }

  // Reserve room on the left for root peers so the CEO still sits centered.
  const peerBlockW = rootPeers.length * (nodeW + hGap)
  place(realRoot, peerBlockW, 0)

  // Place root peers to the left of the CEO at depth 0.
  let peerX = 0
  for (const peer of rootPeers) {
    positioned.push({
      node: peer,
      x: peerX,
      y: 0,
      width: nodeW,
      height: nodeH,
      depth: 0,
      isRootPeer: true,
    })
    peerX += nodeW + hGap
  }

  const baseWidth = (subtreeWidth.get(realRoot.id) ?? nodeW) + peerBlockW
  const width = baseWidth
  const height = (maxDepth + 1) * nodeH + maxDepth * vGap
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
  const [mode, setMode] = useState<Mode>('detailed')
  const [reparenting, setReparenting] = useState(false)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const panRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

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

  // Card dimensions per mode.
  const dims = useMemo(() => {
    if (mode === 'compact') {
      return { w: 180, h: 56, hGap: 18, vGap: 44 }
    }
    return { w: 220, h: 116, hGap: 28, vGap: 70 }
  }, [mode])

  const laidOut = useMemo(() => {
    if (!data) return null
    return layout(data.tree, dims.w, dims.h, dims.hGap, dims.vGap)
  }, [data, dims])

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

  // ─── Pan + zoom interactions ────────────────────────────────────────────
  // Mouse-wheel zoom: requires Ctrl held to avoid hijacking page scroll.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const dir = e.deltaY > 0 ? -1 : 1
    setZoom((z) => {
      const next = +(z + dir * 0.1).toFixed(2)
      return Math.max(0.25, Math.min(2, next))
    })
  }, [])

  // Click-drag panning anywhere on the canvas background (not on a card).
  function onPanMouseDown(e: React.MouseEvent) {
    // Only start a pan when the mousedown lands on the canvas/background, not on a card.
    const target = e.target as HTMLElement
    if (target.closest('[data-org-card]')) return
    panRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    window.addEventListener('mousemove', onPanMove)
    window.addEventListener('mouseup', onPanUp)
  }
  function onPanMove(e: MouseEvent) {
    const p = panRef.current
    if (!p) return
    setPan({ x: p.panX + (e.clientX - p.startX), y: p.panY + (e.clientY - p.startY) })
  }
  function onPanUp() {
    panRef.current = null
    window.removeEventListener('mousemove', onPanMove)
    window.removeEventListener('mouseup', onPanUp)
  }

  // Fit to screen: scale the tree to fit the viewport, then recenter.
  function fitToScreen() {
    if (!laidOut || !viewportRef.current) return
    const vp = viewportRef.current.getBoundingClientRect()
    const padding = 40
    const sx = (vp.width - padding) / laidOut.width
    const sy = (vp.height - padding) / laidOut.height
    const next = Math.max(0.25, Math.min(2, Math.min(sx, sy)))
    setZoom(+next.toFixed(2))
    setPan({ x: 0, y: 0 })
  }

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

  const nodeW = dims.w
  const nodeH = dims.h

  return (
    <div className="space-y-3">
      {/* Sticky toolbar — search, filter, mode toggle, zoom controls */}
      <div className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-100 pb-2 pt-1">
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

          {/* Compact / Detailed pill */}
          <div className="inline-flex border border-gray-200 rounded-full p-0.5 text-xs">
            <button
              onClick={() => setMode('compact')}
              className={`px-3 py-1 rounded-full ${mode === 'compact' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              Compact
            </button>
            <button
              onClick={() => setMode('detailed')}
              className={`px-3 py-1 rounded-full ${mode === 'detailed' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              Detailed
            </button>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}
              className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center"
              title="Zoom out"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-xs text-gray-500 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
              className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center"
              title="Zoom in"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={fitToScreen}
              className="ml-1 px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1"
              title="Fit to screen"
            >
              <Maximize2 className="w-3 h-3" />
              <span className="hidden sm:inline">Fit</span>
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

        {/* Stats line */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-2">
          <span>
            <strong className="text-gray-900">{data.totalActive}</strong> active employees
          </span>
          <span>·</span>
          <span>
            <strong className="text-gray-900">{data.roots}</strong> top-level
          </span>
          {canEdit ? (
            <>
              <span>·</span>
              <span className="text-blue-600">HR can drag to reparent</span>
            </>
          ) : (
            <>
              <span>·</span>
              <span>Read-only view</span>
            </>
          )}
          <span>·</span>
          <span>Hold <kbd className="px-1 border rounded text-[10px]">Ctrl</kbd> + scroll to zoom · drag background to pan</span>
        </div>
      </div>

      {/* Canvas viewport */}
      <div
        ref={viewportRef}
        className="overflow-hidden bg-slate-50 border border-gray-200 rounded-xl relative select-none"
        style={{ height: '70vh', cursor: panRef.current ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={onPanMouseDown}
      >
        <div
          ref={containerRef}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0,
            left: 0,
            padding: 20,
            width: laidOut.width + 40,
            height: laidOut.height + 40,
          }}
        >
          <svg
            width={laidOut.width + 40}
            height={laidOut.height + 40}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            {laidOut.positioned.map((p) => {
              // For each node, draw a connector down to each child that is NOT a root peer
              // (peers are linked horizontally with a dotted line, see below).
              return p.node.children
                .filter((c) => !c.isPeer)
                .map((c) => {
                  const child = laidOut.positioned.find((q) => q.node.id === c.id)
                  if (!child) return null
                  const x1 = p.x + nodeW / 2 + 20
                  const y1 = p.y + nodeH + 20
                  const x2 = child.x + nodeW / 2 + 20
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
            {/* Dotted peer-connector(s) between the CEO and each Co-Founder. */}
            {(() => {
              const ceoPos = laidOut.positioned.find((p) => !p.isRootPeer && p.depth === 0)
              if (!ceoPos) return null
              return laidOut.positioned
                .filter((p) => p.isRootPeer)
                .map((peer) => {
                  const y = ceoPos.y + nodeH / 2 + 20
                  const x1 = Math.min(peer.x, ceoPos.x) + nodeW + 20
                  const x2 = Math.max(peer.x, ceoPos.x) + 20
                  return (
                    <line
                      key={`peer-${peer.node.id}`}
                      x1={x1}
                      y1={y}
                      x2={x2}
                      y2={y}
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                  )
                })
            })()}
          </svg>

          {laidOut.positioned.map((p) => (
            <div
              key={p.node.id}
              data-org-card
              style={{
                position: 'absolute',
                left: p.x + 20,
                top: p.y + 20,
                width: nodeW,
                height: nodeH,
              }}
            >
              <OrgNodeCard
                node={p.node}
                mode={mode}
                isPeer={!!p.isRootPeer}
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
                  // Disallow dropping onto a virtual bucket like "Unassigned".
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
