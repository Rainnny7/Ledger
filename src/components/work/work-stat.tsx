import type { ReactNode } from "react"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function WorkStat({
  label,
  value,
  hint,
}: {
  label: string
  value: ReactNode
  hint?: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl! font-semibold tabular-nums">
          {value}
        </CardTitle>
        {hint && (
          <p className="truncate text-xs text-muted-foreground">{hint}</p>
        )}
      </CardHeader>
    </Card>
  )
}
