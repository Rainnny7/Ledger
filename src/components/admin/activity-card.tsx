import { useQuery } from "@tanstack/react-query"
import { History } from "lucide-react"
import { useState } from "react"
import { Hint } from "@/components/common/hint"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { adminFetch, auditKey } from "@/lib/admin"
import { formatRelative, formatTimestamp } from "@/lib/format"
import { cn } from "cn"

interface AuditEntry {
  id: string
  at: string
  kind: "admin" | "auth"
  ip: string | null
  actorEmail: string | null
  action: string
  targetEmail: string | null
  detail: string | null
}

type AuditFilter = "all" | "admin" | "auth"

/** The audit log: admin changes and sign-ins. */
export function ActivityCard() {
  const [filter, setFilter] = useState<AuditFilter>("all")
  const [showAll, setShowAll] = useState(false)
  const audit = useQuery({
    queryKey: [...auditKey, filter],
    queryFn: () =>
      adminFetch<{ entries: AuditEntry[] }>(
        filter === "all" ? "audit" : `audit?kind=${filter}`
      ),
  })
  const entries = audit.data?.entries ?? []
  const shown = showAll ? entries : entries.slice(0, 25)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" /> Audit log
        </CardTitle>
        <CardDescription>
          Admin changes, sign-ins and sign-outs (failed attempts too), with who
          did it and from where.
        </CardDescription>
        <CardAction>
          <ToggleGroup
            value={[filter]}
            onValueChange={(v) => v[0] && setFilter(v[0] as AuditFilter)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
            <ToggleGroupItem value="auth">Sign-ins</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {audit.isPending && <Skeleton className="h-16 w-full" />}
        {audit.error && (
          <p className="text-sm text-destructive">{audit.error.message}</p>
        )}
        {audit.data && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        )}
        {entries.length > 0 && (
          <ul className="grid gap-0.5 text-sm">
            {shown.map((e) => {
              const failed = e.action.endsWith("(failed)")
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                >
                  <span
                    className={cn("font-medium", failed && "text-destructive")}
                  >
                    {e.action}
                  </span>
                  {e.targetEmail && (
                    <span className="min-w-0 truncate">{e.targetEmail}</span>
                  )}
                  {e.detail && (
                    <span className="text-muted-foreground">{e.detail}</span>
                  )}
                  <Hint label={formatTimestamp(e.at)} side="left">
                    <span className="ml-auto cursor-default text-xs text-muted-foreground">
                      {e.actorEmail ?? "unknown"}
                      {e.ip && ` · ${e.ip}`} · {formatRelative(e.at)}
                    </span>
                  </Hint>
                </li>
              )
            })}
          </ul>
        )}
        {entries.length > 25 && (
          <button
            type="button"
            className="mt-2 text-xs font-medium text-primary hover:underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show less" : `Show all ${entries.length}`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
