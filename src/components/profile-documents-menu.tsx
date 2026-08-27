'use client'

/**
 * The paperwork for one person, behind a single control.
 *
 * These were three buttons sitting in the profile's action row alongside
 * Change Job, Delete and Edit — six controls of equal weight, where the two
 * you press most were the hardest to pick out. Generating a document is one
 * kind of job, so it gets one button and a menu.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { FileText, ChevronDown } from 'lucide-react'

interface Props { employeeId: string }

const DOCS: { type: string; label: string; hint: string }[] = [
  { type: 'offer_letter', label: 'Employment Letter', hint: 'Offer and terms, from the record' },
  { type: 'employment_agreement', label: 'Employment Agreement', hint: 'Full agreement with signature slots' },
  { type: 'nda', label: 'NDA', hint: 'Confidentiality and IP assignment' },
]

export default function ProfileDocumentsMenu({ employeeId }: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 text-slate-700 text-xs px-3 py-2 hover:bg-slate-50"
        >
          <FileText className="w-3.5 h-3.5" /> Documents
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[240px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {DOCS.map((d) => (
            <DropdownMenu.Item key={d.type} asChild>
              <a
                href={`/api/documents/generate?type=${d.type}&employeeId=${employeeId}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col gap-0.5 rounded-md px-3 py-2 text-sm text-slate-800 outline-none cursor-pointer hover:bg-slate-50 focus:bg-slate-50"
              >
                <span className="font-medium">{d.label}</span>
                <span className="text-[11px] text-slate-500">{d.hint}</span>
              </a>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
