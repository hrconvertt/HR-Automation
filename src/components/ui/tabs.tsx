'use client'

import * as RadixTabs from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = RadixTabs.Root

function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1',
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
        'text-gray-600 hover:text-gray-900',
        'data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      className={cn('mt-4 focus-visible:outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
