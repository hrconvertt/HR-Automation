import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// ─── Org Chart — nested tree from Employee.reportingManagerId ────────────────
// Role-gated to HR_ADMIN + EXECUTIVE + MANAGER + EMPLOYEE (read-only for non-HR).
// Builds a tree live from the DB. The CEO (designation contains "CEO" or
// "Chief Executive") becomes the visual root; a Co-Founder (designation contains
// "Co-Founder" / "Founder") renders as a peer of the CEO with a soft connector.
// Any other root-level employees with no manager are bucketed under a small
// "Unassigned" virtual node at the bottom so HR can drag them to a real parent.
// Cycles are broken gracefully — the second occurrence is marked with a warning
// rather than recursing infinitely.

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
  children: OrgNode[]
  // Marks a synthetic wrapper (e.g. "Unassigned" bucket). Not draggable.
  isVirtual?: boolean
  // Marks a peer node (e.g. Co-Founder) that renders next to the CEO with a
  // dotted connector rather than as a child.
  isPeer?: boolean
}

function isCeo(d: string): boolean {
  const s = d.toLowerCase()
  return s.includes('chief executive') || /\bceo\b/.test(s)
}

function isCoFounder(d: string): boolean {
  const s = d.toLowerCase()
  if (s.includes('co-founder') || s.includes('cofounder') || s.includes('co founder')) return true
  // "Founder" alone also qualifies, but exclude CEO matches above.
  return /\bfounder\b/.test(s) && !isCeo(d)
}

// Senior keywords ranked first when sorting siblings.
const SENIORITY_KEYWORDS = [
  'ceo', 'chief', 'founder', 'president',
  'head', 'director', 'vp', 'vice president',
  'principal', 'lead', 'manager', 'senior',
]

function seniorityRank(designation: string): number {
  const d = designation.toLowerCase()
  for (let i = 0; i < SENIORITY_KEYWORDS.length; i++) {
    if (d.includes(SENIORITY_KEYWORDS[i])) return i
  }
  return SENIORITY_KEYWORDS.length
}

function sortChildren(nodes: OrgNode[]): OrgNode[] {
  return nodes.sort((a, b) => {
    const ra = seniorityRank(a.designation)
    const rb = seniorityRank(b.designation)
    if (ra !== rb) return ra - rb
    return a.fullName.localeCompare(b.fullName)
  })
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('hr_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Preview-aware effective role: HR can preview as Exec etc.
  const previewRole = payload.role === 'HR_ADMIN'
    ? request.cookies.get('hr_preview_role')?.value
    : undefined
  const effectiveRole = previewRole ?? payload.role

  // All 4 roles can READ the org chart. Only HR_ADMIN can edit (drag-reparent).
  if (
    effectiveRole !== 'HR_ADMIN' &&
    effectiveRole !== 'EXECUTIVE' &&
    effectiveRole !== 'MANAGER' &&
    effectiveRole !== 'EMPLOYEE'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Include ACTIVE + PROBATION + ON_LEAVE. Excluding only the truly-departed
  // (RESIGNED / TERMINATED / INACTIVE) means people on probation or extended
  // leave still appear in the org chart — explains why Iqra Naveed seemed
  // to vanish when her status was flipped to PROBATION at one point.
  const employees = await prisma.employee.findMany({
    where: { status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] } },
    select: {
      status: true,
      id: true,
      fullName: true,
      employeeCode: true,
      designation: true,
      photoUrl: true,
      reportingManagerId: true,
      department: { select: { id: true, name: true } },
    },
  })

  console.log(
    '[org-chart] visible employees:',
    employees.length,
    employees.map((e) => `${e.fullName} (${e.status})`).join(', ')
  )

  // Build a node map.
  const nodes = new Map<string, OrgNode>()
  for (const e of employees) {
    nodes.set(e.id, {
      id: e.id,
      fullName: e.fullName,
      employeeCode: e.employeeCode,
      designation: e.designation,
      department: e.department?.name ?? null,
      departmentId: e.department?.id ?? null,
      photoUrl: e.photoUrl,
      reportingManagerId: e.reportingManagerId,
      directReports: 0,
      children: [],
    })
  }

  // Wire children with cycle detection.
  // A cycle is any node reachable from itself via the manager chain. We pre-
  // compute which nodes participate in cycles by walking up from each node;
  // any node we revisit during a single walk is in a cycle.
  const inCycle = new Set<string>()
  for (const node of nodes.values()) {
    const seen = new Set<string>()
    let cur: OrgNode | undefined = node
    while (cur && cur.reportingManagerId) {
      if (seen.has(cur.id)) {
        inCycle.add(cur.id)
        break
      }
      seen.add(cur.id)
      cur = nodes.get(cur.reportingManagerId)
    }
  }

  const roots: OrgNode[] = []
  for (const node of nodes.values()) {
    const parentId = node.reportingManagerId
    if (!parentId) {
      roots.push(node)
      continue
    }
    const parent = nodes.get(parentId)
    if (!parent) {
      // Manager points at an inactive/missing employee — treat as root.
      roots.push(node)
      continue
    }
    // Break the cycle: if this edge would close a loop, drop the child here
    // and mark it so the UI can show a warning chip.
    if (inCycle.has(node.id) && inCycle.has(parent.id)) {
      // Detach: keep the cyclic node at the top level with a warning.
      node.warning = 'Reporting cycle detected — please fix manager assignment'
      roots.push(node)
      continue
    }
    parent.children.push(node)
    parent.directReports += 1
  }

  // Recursively sort.
  function sortRec(n: OrgNode) {
    if (n.children.length) {
      sortChildren(n.children)
      n.children.forEach(sortRec)
    }
  }
  sortChildren(roots)
  roots.forEach(sortRec)

  // Identify the CEO (visual top) and any Co-Founders (peers).
  // If multiple matches exist we pick the first by sort order; everyone else
  // who has no manager becomes "Unassigned" at the bottom.
  const ceo = roots.find((r) => isCeo(r.designation)) ?? null
  const coFounders = roots.filter((r) => r !== ceo && isCoFounder(r.designation))
  const orphans = roots.filter((r) => r !== ceo && !coFounders.includes(r))

  // Orphans get a small warning so HR notices them.
  for (const o of orphans) {
    if (!o.warning) o.warning = 'No manager set — drag onto a manager to fix'
  }

  let tree: OrgNode
  if (ceo) {
    // Tree starts from the CEO. Co-Founders ride along as peers (rendered next
    // to the CEO by the UI). We tag them with isPeer so the layout can place
    // them at the same depth as the CEO instead of as children.
    const peers: OrgNode[] = coFounders.map((c) => ({ ...c, isPeer: true }))
    tree = { ...ceo }
    // Attach peers as a sibling-list on the root via a synthetic property —
    // we re-use children but tag them isPeer to keep the existing layout code
    // happy. The UI inspects isPeer to render them at the same depth.
    if (peers.length) {
      tree.children = [...peers, ...tree.children]
    }
  } else if (roots.length === 1) {
    tree = roots[0]
  } else {
    // No CEO and multiple roots — fall back to the first root and bucket the
    // rest under "Unassigned". This is a degraded state HR should fix.
    tree = roots[0]
    orphans.push(...roots.slice(1))
  }

  if (orphans.length) {
    const unassigned: OrgNode = {
      id: '__unassigned__',
      fullName: 'Unassigned',
      employeeCode: '',
      designation: 'No manager assigned',
      department: null,
      departmentId: null,
      photoUrl: null,
      reportingManagerId: null,
      directReports: orphans.length,
      isVirtual: true,
      children: orphans,
    }
    // Hang the Unassigned bucket off the root so it appears at the bottom.
    tree.children = [...tree.children, unassigned]
  }

  // Departments list for filter chips.
  const deptMap = new Map<string, { id: string; name: string }>()
  for (const e of employees) {
    if (e.department) deptMap.set(e.department.id, e.department)
  }
  const departments = Array.from(deptMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    tree,
    roots: roots.length,
    totalActive: employees.length,
    departments,
    canEdit: effectiveRole === 'HR_ADMIN',
  })
}
