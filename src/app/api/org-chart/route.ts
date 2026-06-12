import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// ─── Org Chart — nested tree from Employee.reportingManagerId ────────────────
// Role-gated to HR_ADMIN + EXECUTIVE. Builds a tree live from the DB; if
// multiple roots exist they are wrapped under a synthetic "Convertt" root so
// the page can render a single tree. Cycles are broken gracefully — the
// second occurrence is marked with a warning rather than recursing infinitely.

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
  // Marks the synthetic root wrapper when multiple top-level employees exist.
  isVirtual?: boolean
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

  if (effectiveRole !== 'HR_ADMIN' && effectiveRole !== 'EXECUTIVE') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      designation: true,
      photoUrl: true,
      reportingManagerId: true,
      department: { select: { id: true, name: true } },
    },
  })

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

  let tree: OrgNode
  if (roots.length === 1) {
    tree = roots[0]
  } else {
    tree = {
      id: '__convertt_root__',
      fullName: 'Convertt',
      employeeCode: '',
      designation: 'Organisation',
      department: null,
      departmentId: null,
      photoUrl: null,
      reportingManagerId: null,
      directReports: roots.length,
      isVirtual: true,
      children: roots,
    }
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
