import { useQuery } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, History } from "lucide-react"
import { useState } from "react"
import { Hint } from "@/components/common/hint"
import { Button } from "@/components/ui/button"
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

const PAGE_SIZE = 25

/** The audit log: admin changes and logins. */
export function ActivityCard() {
	const [filter, setFilter] = useState<AuditFilter>("all")
	const [page, setPage] = useState(0)
	const audit = useQuery({
		queryKey: [...auditKey, filter, page],
		queryFn: () => {
			const params = new URLSearchParams({
				limit: String(PAGE_SIZE),
				offset: String(page * PAGE_SIZE),
			})
			if (filter !== "all") {
				params.set("kind", filter)
			}
			return adminFetch<{ entries: AuditEntry[]; total: number }>(
				`audit?${params}`
			)
		},
	})
	const entries = audit.data?.entries ?? []
	const total = audit.data?.total ?? 0
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
	const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1
	const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total)

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<History className="size-4 text-muted-foreground" /> Audit
					log
				</CardTitle>
				<CardDescription>
					Admin changes, logins and logouts (failed attempts too),
					with who did it and from where.
				</CardDescription>
				<CardAction>
					<ToggleGroup
						value={[filter]}
						onValueChange={(values) => {
							if (values[0]) {
								setFilter(values[0] as AuditFilter)
								setPage(0)
							}
						}}
						variant="outline"
						size="sm"
					>
						<ToggleGroupItem value="all">All</ToggleGroupItem>
						<ToggleGroupItem value="admin">Admin</ToggleGroupItem>
						<ToggleGroupItem value="auth">Logins</ToggleGroupItem>
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
				{audit.data && total === 0 && (
					<p className="text-sm text-muted-foreground">
						Nothing yet.
					</p>
				)}
				{entries.length > 0 && (
					<ul className="grid gap-0.5 text-sm">
						{entries.map((entry) => {
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
				{total > PAGE_SIZE && (
					<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
						<p className="text-xs text-muted-foreground">
							{rangeStart.toLocaleString()}–
							{rangeEnd.toLocaleString()} of{" "}
							{total.toLocaleString()}
						</p>
						<div className="flex items-center gap-1">
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Previous page"
								disabled={page === 0 || audit.isFetching}
								onClick={() =>
									setPage((current) =>
										Math.max(0, current - 1)
									)
								}
							>
								<ChevronLeft className="size-4" />
							</Button>
							<span className="min-w-16 text-center text-xs text-muted-foreground">
								{page + 1} / {totalPages}
							</span>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label="Next page"
								disabled={
									page >= totalPages - 1 || audit.isFetching
								}
								onClick={() =>
									setPage((current) =>
										Math.min(totalPages - 1, current + 1)
									)
								}
							>
								<ChevronRight className="size-4" />
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}