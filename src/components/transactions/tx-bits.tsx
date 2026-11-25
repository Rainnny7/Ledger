import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Category } from "@/lib/api"
import { CATEGORY_META } from "@/lib/categories"
import {
  formatLongDate,
  formatRelative,
  formatRelativeDate,
  formatTimestamp,
  localDate,
} from "@/lib/format"
import { cn } from "cn"

/** "3 days ago", with the full date on hover. TD only gives a posting date, so the first-sync time is shown when it's close. */
export function RelativeDate({
  date,
  seenAt,
  className,
}: {
  date: string
  seenAt?: string
  className?: string
}) {
  const seenDay = seenAt && localDate(seenAt)
  const showSeen =
    !!seenAt &&
    !!seenDay &&
    Math.abs(Date.parse(seenDay) - Date.parse(date)) <= 2 * 86_400_000
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "cursor-default whitespace-nowrap underline decoration-muted-foreground/30 decoration-dotted underline-offset-4",
              className
            )}
          />
        }
      >
        {formatRelativeDate(date)}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span>{formatLongDate(date)}</span>
        {showSeen && (
          <span className="opacity-70">
            First synced {formatTimestamp(seenAt)}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * "synced 3h ago" for a bank connection; hovering shows the exact time, and when the background
 * refresh will next sync it (or why it won't on its own).
 */
export function SyncTime({
  at,
  next,
  savedCredentials,
  error,
  needsSignIn,
}: {
  at: string | null
  next?: string | null
  savedCredentials: boolean
  error?: string | null
  needsSignIn?: boolean
}) {
  const nextLine = next
    ? `Next auto-sync ${formatTimestamp(next)} (${formatRelative(next)})`
    : needsSignIn
      ? "Auto-sync is waiting for you to sign in with a two-factor code"
      : error
        ? "Auto-sync is paused until this connection is fixed"
        : !savedCredentials
          ? "No auto-sync: sign-in details aren’t saved, so it only refreshes when you do"
          : "Auto-sync is waiting for you to sign in with a two-factor code"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "cursor-default underline decoration-muted-foreground/30 decoration-dotted underline-offset-4",
              (error || needsSignIn) &&
                "font-medium text-destructive decoration-destructive/40"
            )}
          />
        }
      >
        synced {formatRelative(at)}
        {(error || needsSignIn) && " · auto-sync paused"}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span>
          {at ? `Last synced ${formatTimestamp(at)}` : "Never synced"}
        </span>
        <span className="opacity-70">{nextLine}</span>
      </TooltipContent>
    </Tooltip>
  )
}

export function CategoryIcon({
  category,
  className,
}: {
  category: Category
  className?: string
}) {
  const Icon = CATEGORY_META[category].icon
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

export function CategoryBadge({
  category,
  className,
}: {
  category: Category
  className?: string
}) {
  const { icon: Icon, label } = CATEGORY_META[category]
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border px-2 text-xs whitespace-nowrap text-muted-foreground",
        className
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  )
}
