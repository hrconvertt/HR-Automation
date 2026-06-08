'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

export function BackButton({ fallback = '/dashboard' }: { fallback?: string }) {
  const router = useRouter()
  return (
    <button
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back()
        } else {
          router.push(fallback)
        }
      }}
      className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-3"
    >
      <ChevronLeft className="w-4 h-4" /> Back
    </button>
  )
}
