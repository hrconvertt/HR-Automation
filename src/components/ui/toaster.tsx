'use client'

/**
 * Toasts — the app's one channel for "that worked" and "that didn't".
 *
 * Three things were wrong before. Every toast was `fixed bottom-4 right-4`,
 * so a second one landed exactly on top of the first and you only ever saw
 * the last. The viewport, which is what Radix actually wants to position and
 * stack, was rendered empty and unstyled. And `destructive` was painted slate
 * — the same grey as everything else — so a failure was indistinguishable
 * from a success at a glance, which is the only glance anyone gives a toast.
 *
 * Now the viewport does the positioning and stacking, success reads emerald,
 * failure reads red, and both say so in the icon as well as the colour.
 */

import * as Toast from '@radix-ui/react-toast'
import { useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'success' | 'destructive'

interface ToastItem {
  id: string
  title: string
  description?: string
  variant?: Variant
}

let toastQueue: ((t: ToastItem) => void) | null = null

export function toast(item: Omit<ToastItem, 'id'>) {
  if (toastQueue) {
    toastQueue({ ...item, id: Math.random().toString(36).slice(2) })
  }
}

/** Shorthands, so a call site says what happened rather than picking a colour. */
export const toastSuccess = (title: string, description?: string | null) =>
  toast({ title, description: description ?? undefined, variant: 'success' })
export const toastError = (title: string, description?: string | null) =>
  toast({ title, description: description ?? undefined, variant: 'destructive' })

const TONE: Record<Variant, { box: string; icon: string; Icon: typeof Info }> = {
  default: { box: 'border-slate-200 bg-white', icon: 'text-slate-400', Icon: Info },
  success: { box: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-600', Icon: CheckCircle2 },
  destructive: { box: 'border-red-200 bg-red-50', icon: 'text-red-600', Icon: AlertCircle },
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((t: ToastItem) => {
    // Cap the stack. Ten failures in a row is a broken screen, not ten things
    // worth reading — keep the most recent handful.
    setToasts((prev) => [...prev, t].slice(-4))
  }, [])

  toastQueue = addToast

  return (
    <Toast.Provider swipeDirection="right" duration={5000}>
      {toasts.map((t) => {
        const tone = TONE[t.variant ?? 'default']
        const Icon = tone.Icon
        return (
          <Toast.Root
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-3.5 shadow-lg w-full',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-4',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out',
              tone.box,
            )}
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }}
          >
            <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', tone.icon)} />
            <div className="min-w-0 flex-1">
              <Toast.Title className="font-semibold text-[13px] text-slate-900">
                {t.title}
              </Toast.Title>
              {t.description && (
                <Toast.Description className="text-xs text-slate-600 mt-0.5 break-words">
                  {t.description}
                </Toast.Description>
              )}
            </div>
            <Toast.Close
              aria-label="Dismiss"
              className="text-slate-400 hover:text-slate-700 text-xs flex-shrink-0 leading-none mt-0.5"
            >
              ✕
            </Toast.Close>
          </Toast.Root>
        )
      })}
      {/* The viewport positions and stacks. Individual toasts must not be
          `fixed` themselves, or they all land on the same 4px corner. */}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))] m-0 list-none outline-none" />
    </Toast.Provider>
  )
}
