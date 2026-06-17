import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      // Monochrome — brand black is the only accent. Destructive uses a
      // bold outline (not red) so it still reads as "careful, this is heavy"
      // without breaking the palette.
      variant: {
        default:     'bg-slate-900 text-white hover:bg-black border border-slate-900',
        outline:     'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
        ghost:       'text-slate-700 hover:bg-slate-100',
        destructive: 'bg-white text-slate-900 border-2 border-slate-900 font-semibold hover:bg-slate-100',
        secondary:   'bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200',
        success:     'bg-slate-900 text-white hover:bg-black border border-slate-900',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
