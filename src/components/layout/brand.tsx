import { Landmark } from "lucide-react"
import { cn } from "cn"

/** The Ledger logo: a bank icon on a pastel sunset tile (matches the favicon). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-sunset text-white shadow-sm",
        className
      )}
    >
      <Landmark className="size-4" strokeWidth={2.25} />
    </span>
  )
}

/** Logo plus wordmark. Pass `hideNameOnMobile` to show only the mark on small screens. */
export function Brand({
  className,
  hideNameOnMobile,
}: {
  className?: string
  hideNameOnMobile?: boolean
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 font-semibold tracking-tight",
        className
      )}
    >
      <BrandMark />
      <span className={cn(hideNameOnMobile && "hidden sm:inline")}>Ledger</span>
    </span>
  )
}
