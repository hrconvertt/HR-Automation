'use client'

import Link from 'next/link'
import { AlertTriangle, UserX } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { OrgNode } from './org-tree'

interface Props {
  node: OrgNode
  mode: 'compact' | 'detailed'
  isPeer: boolean
  canEdit: boolean
  isDragging: boolean
  isDropTarget: boolean
  dimmed: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (employeeId: string) => void
}

// Deterministic colour from id — so the same employee always gets the same hue.
function colourFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const palette = [
    'bg-blue-500',
    'bg-indigo-500',
    'bg-emerald-500',
    'bg-purple-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-teal-500',
    'bg-fuchsia-500',
  ]
  return palette[h % palette.length]
}

export default function OrgNodeCard({
  node,
  mode,
  isPeer,
  canEdit,
  isDragging,
  isDropTarget,
  dimmed,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  if (node.isVirtual) {
    // Special "Unassigned" / other synthetic buckets.
    return (
      <div className="w-full h-full bg-amber-50 border border-amber-200 text-amber-900 rounded-xl flex items-center gap-2 px-3 shadow-sm">
        <UserX className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{node.fullName}</p>
          <p className="text-[10px] text-amber-700 truncate">
            {node.directReports} employee{node.directReports === 1 ? '' : 's'} need a manager
          </p>
        </div>
      </div>
    )
  }

  const avatarColor = colourFor(node.id)
  // Photo URL: prefer the photoUrl on the record (set by API from
  // Employee.photoUrl); fall back to the /api/employees/{id}/photo endpoint
  // if/when it exists. The <img> onError swallows broken loads silently.
  const photoSrc = node.photoUrl || `/api/employees/${node.id}/photo`
  const avatarSize = mode === 'compact' ? 'w-8 h-8' : 'w-10 h-10'
  const avatarPx = mode === 'compact' ? 32 : 40

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => {
        if (!canEdit) return
        e.dataTransfer.setData('text/plain', node.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        const employeeId = e.dataTransfer.getData('text/plain')
        if (employeeId && employeeId !== node.id) onDrop(employeeId)
      }}
      className={`
        group w-full h-full bg-white rounded-xl border shadow-sm transition-all relative
        ${isDragging ? 'opacity-40 scale-95' : ''}
        ${isDropTarget ? 'border-blue-500 ring-2 ring-blue-200 shadow-md' : isPeer ? 'border-slate-300 border-dashed' : 'border-gray-200'}
        ${dimmed ? 'opacity-30' : ''}
        ${canEdit ? 'cursor-move hover:shadow-md hover:border-blue-300' : 'hover:shadow-md'}
      `}
    >
      {isPeer && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[9px] font-semibold bg-slate-700 text-white rounded">
          Co-Founder
        </div>
      )}
      <Link
        href={`/dashboard/employees/${node.id}`}
        className={`block ${mode === 'compact' ? 'px-2.5 py-2' : 'px-3 py-3'} h-full`}
        draggable={false}
        onClick={(e) => {
          if (isDragging) e.preventDefault()
        }}
      >
        {mode === 'compact' ? (
          // ── Compact: photo + name only ─────────────────────────────────
          <div className="flex items-center gap-2 h-full">
            <Avatar src={photoSrc} name={node.fullName} className={`${avatarSize} ${avatarColor}`} size={avatarPx} />
            <p className="text-[12px] font-semibold text-gray-900 truncate leading-tight flex-1">
              {node.fullName}
            </p>
          </div>
        ) : (
          // ── Detailed: photo + name + designation + dept pill + report count ──
          <>
            <div className="flex items-start gap-2.5">
              <Avatar src={photoSrc} name={node.fullName} className={`${avatarSize} ${avatarColor}`} size={avatarPx} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">
                  {node.fullName}
                </p>
                <p className="text-[11px] text-gray-500 truncate leading-snug mt-0.5">
                  {node.designation}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {node.department ? (
                <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 rounded">
                  {node.department}
                </span>
              ) : (
                <span />
              )}
              {node.totalReports > 0 && (
                <span
                  className="text-[10px] text-gray-500"
                  title={
                    node.totalReports !== node.directReports
                      ? `${node.directReports} direct, ${node.totalReports} total`
                      : undefined
                  }
                >
                  {node.totalReports} report{node.totalReports === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </>
        )}
        {node.warning && (
          <div
            className="absolute -top-2 -right-2 bg-amber-500 text-white rounded-full p-1 shadow"
            title={node.warning}
          >
            <AlertTriangle className="w-3 h-3" />
          </div>
        )}
      </Link>
    </div>
  )
}

// Avatar — photo with fallback to coloured initials circle. Uses a state-less
// onError swap (sets data-failed), so a missing /api/employees/{id}/photo
// route degrades gracefully to initials without hammering the network.
function Avatar({
  src,
  name,
  className,
  size,
}: {
  src: string
  name: string
  className: string
  size: number
}) {
  return (
    <div className={`relative rounded-full overflow-hidden flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold">
        {getInitials(name)}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => {
          // Swap to a 1x1 transparent so the underlying initials show through.
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    </div>
  )
}
