'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import type { OrgNode } from './org-tree'

interface Props {
  node: OrgNode
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
    return (
      <div className="w-full h-full bg-slate-900 text-white rounded-xl flex flex-col items-center justify-center px-3 shadow-md">
        <p className="text-sm font-semibold">{node.fullName}</p>
        <p className="text-[10px] text-slate-300">{node.directReports} reporting lines</p>
      </div>
    )
  }

  const avatarColor = colourFor(node.id)

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
        ${isDropTarget ? 'border-blue-500 ring-2 ring-blue-200 shadow-md' : 'border-gray-200'}
        ${dimmed ? 'opacity-30' : ''}
        ${canEdit ? 'cursor-move hover:shadow-md hover:border-blue-300' : 'hover:shadow-md'}
      `}
    >
      <Link
        href={`/dashboard/employees/${node.id}`}
        className="block px-3 py-3 h-full"
        draggable={false}
        onClick={(e) => {
          // Don't navigate if user is mid-drag — Firefox sometimes fires click after drag.
          if (isDragging) e.preventDefault()
        }}
      >
        <div className="flex items-start gap-2.5">
          {node.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={node.photoUrl}
              alt=""
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor}`}
            >
              {getInitials(node.fullName)}
            </div>
          )}
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
          {node.directReports > 0 && (
            <span className="text-[10px] text-gray-500">
              {node.directReports} report{node.directReports === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {node.warning && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-white rounded-full p-1 shadow" title={node.warning}>
            <AlertTriangle className="w-3 h-3" />
          </div>
        )}
      </Link>
    </div>
  )
}
