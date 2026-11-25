import { isProviderId, PROVIDERS } from "@/components/accounts/providers"
import { cn } from "cn"

/** A provider's logo (or monogram), used to label its connections. */
export function InstitutionBadge({
  institution,
  className,
}: {
  institution: string
  className?: string
}) {
  const p = isProviderId(institution) ? PROVIDERS[institution] : null
  if (p?.logo) {
    const Logo = p.logo
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md border bg-white p-1.5 shadow-xs",
          className
        )}
      >
        <Logo className="size-full" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      style={{ backgroundColor: p?.color }}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted-foreground text-sm font-bold tracking-tight text-white",
        className
      )}
    >
      {p?.mark ?? institution.slice(0, 2).toUpperCase()}
    </span>
  )
}
