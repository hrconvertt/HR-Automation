'use client'

import * as RadixAvatar from '@radix-ui/react-avatar'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  name: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
}

function Avatar({ src, name, className, size = 'md' }: AvatarProps) {
  return (
    <RadixAvatar.Root
      className={cn(
        'relative flex flex-shrink-0 overflow-hidden rounded-full bg-blue-600',
        sizeClasses[size],
        className
      )}
    >
      {src && (
        <RadixAvatar.Image
          src={src}
          alt={name}
          className="aspect-square h-full w-full object-cover"
        />
      )}
      <RadixAvatar.Fallback className="flex h-full w-full items-center justify-center text-white font-semibold">
        {getInitials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  )
}

export { Avatar }
