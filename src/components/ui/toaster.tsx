'use client'

import * as Toast from '@radix-ui/react-toast'
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface ToastItem {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

let toastQueue: ((t: ToastItem) => void) | null = null

export function toast(item: Omit<ToastItem, 'id'>) {
  if (toastQueue) {
    toastQueue({ ...item, id: Math.random().toString(36).slice(2) })
  }
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((t: ToastItem) => {
    setToasts((prev) => [...prev, t])
  }, [])

  toastQueue = addToast

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          className={cn(
            'fixed bottom-4 right-4 z-50 flex items-start gap-3 rounded-lg border p-4 shadow-lg',
            'bg-white text-gray-900',
            t.variant === 'destructive' && 'border-red-200 bg-red-50 text-red-900'
          )}
          onOpenChange={(open) => {
            if (!open) setToasts((prev) => prev.filter((x) => x.id !== t.id))
          }}
        >
          <div>
            <Toast.Title className="font-semibold text-sm">{t.title}</Toast.Title>
            {t.description && (
              <Toast.Description className="text-xs text-gray-500 mt-1">
                {t.description}
              </Toast.Description>
            )}
          </div>
          <Toast.Close className="ml-auto text-gray-400 hover:text-gray-600 text-xs">✕</Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport />
    </Toast.Provider>
  )
}
