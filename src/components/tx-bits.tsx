import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Category } from '@/lib/api'
import { CATEGORY_META } from '@/lib/categories'
import { formatLongDate, formatRelativeDate, formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'

/** "3 days ago", with the full date on hover. TD only gives a posting date, so the first-sync time is shown when it's close. */
export function RelativeDate({ date, seenAt, className }: { date: string; seenAt?: string; className?: string }) {
  const seenDay = seenAt?.slice(0, 10)
  const showSeen = !!seenAt && !!seenDay && Math.abs(Date.parse(seenDay) - Date.parse(date)) <= 2 * 86_400_000
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'cursor-default whitespace-nowrap underline decoration-muted-foreground/30 decoration-dotted underline-offset-4',
              className,
            )}
          />
        }
      >
        {formatRelativeDate(date)}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span>{formatLongDate(date)}</span>
        {showSeen && <span className="opacity-70">First synced {formatTimestamp(seenAt)}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  const Icon = CATEGORY_META[category].icon
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground', className)}>
      <Icon className="size-4" />
    </span>
  )
}

export function CategoryBadge({ category, className }: { category: Category; className?: string }) {
  const { icon: Icon, label } = CATEGORY_META[category]
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-xs whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  )
}
