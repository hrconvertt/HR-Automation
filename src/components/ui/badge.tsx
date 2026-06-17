import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      // Monochrome variants — each tier distinguished by fill / weight /
      // border, never by hue. Brand black (#0A0A0A ≈ slate-900) is the
      // single accent reserved for "Approved" / primary affirmative.
      variant: {
        default:     'bg-slate-500 text-white border border-slate-500',           // "Awaiting HR"
        secondary:   'bg-slate-100 text-slate-700 border border-slate-200',       // muted
        destructive: 'bg-white     text-slate-900 border-2 border-slate-900 font-bold', // Rejected
        outline:     'border border-slate-300 text-slate-700',
        success:     'bg-slate-900 text-white border border-slate-900',           // Approved
        warning:     'bg-slate-300 text-slate-900 border border-slate-400',       // Awaiting Manager
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
