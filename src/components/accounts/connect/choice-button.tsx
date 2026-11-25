import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

export function ChoiceIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      {children}
    </span>
  )
}

/** One option on the dialog's pick screens. */
export function ChoiceButton({
  index,
  icon,
  title,
  description,
  onClick,
}: {
  index: number
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 60}ms` }}
      className="group flex animate-in items-center gap-3 rounded-lg border p-3 text-left transition-colors fade-in-0 fill-mode-both slide-in-from-bottom-1 hover:border-primary/40 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
