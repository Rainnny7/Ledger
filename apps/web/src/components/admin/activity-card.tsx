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
import { QueryError } from "@/components/ui/query-error"
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
					<History className="size-4 text-muted-foreground" /> Audit
					log
				</CardTitle>
				<CardDescription>
					Admin changes, sign-ins and sign-outs (failed attempts too),
					with who did it and from where.
				</CardDescription>
				<CardAction>
					<ToggleGroup
						value={[filter]}
						onValueChange={(values) =>
							values[0] && setFilter(values[0] as AuditFilter)
						}
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
				{audit.error && !audit.data && (
					<QueryError
						message={audit.error.message}
						onRetry={() => void audit.refetch()}
					/>
				)}
				{audit.data && entries.length === 0 && (
					<p className="text-sm text-muted-foreground">
						Nothing yet.
					</p>
				)}
				{entries.length > 0 && (
					<ul className="grid gap-0.5 text-sm">
						{shown.map((entry) => {
							const failed = entry.action.endsWith("(failed)")
							return (
								<li
									key={entry.id}
									className="flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
								>
									<span
										className={cn(
											"font-medium",
											failed && "text-destructive"
										)}
									>
										{entry.action}
									</span>
									{entry.targetEmail && (
										<span className="min-w-0 truncate">
											{entry.targetEmail}
										</span>
									)}
									{entry.detail && (
										<span className="text-muted-foreground">
											{entry.detail}
										</span>
									)}
									<Hint
										label={formatTimestamp(entry.at)}
										side="left"
									>
										<span className="ml-auto cursor-default text-xs text-muted-foreground">
											{entry.actorEmail ?? "unknown"}
											{entry.ip &&
												` · ${entry.ip}`} ·{" "}
											{formatRelative(entry.at)}
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
						onClick={() => setShowAll((visible) => !visible)}
					>
						{showAll ? "Show less" : `Show all ${entries.length}`}
					</button>
				)}
			</CardContent>
		</Card>
	)
}
