import { useQuery } from "@tanstack/react-query"
import { CirclePlay, ListChecks, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Hint } from "@/components/common/hint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { type TaskInfo, every, took } from "@/components/admin/task-types"
import { adminFetch, auditKey, backupsKey, tasksKey } from "@/lib/admin"
import { formatRelative, formatTimestamp } from "@/lib/format"
import { queryClient } from "@/lib/queries"

/** Tasks UI card. */
export function TasksCard({
	showBackupTask = true,
}: {
	showBackupTask?: boolean
}) {
	const tasks = useQuery({
		queryKey: tasksKey,
		queryFn: () => adminFetch<{ tasks: TaskInfo[] }>("tasks"),
		// Keep checking while something runs, so the result shows up when it's done.
		refetchInterval: (query) =>
			query.state.data?.tasks.some((task) => task.running)
				? 3000
				: 60_000,
	})
	const [starting, setStarting] = useState<string | null>(null)
	// When the exchange-rate task finishes, pick up the new rates everywhere in the app.
	const fxFinished = tasks.data?.tasks.find((task) => task.id === "fx-rates")
		?.lastRun?.finishedAt
	useEffect(() => {
		if (fxFinished) {
			void queryClient.invalidateQueries({ queryKey: ["fx"] })
		}
	}, [fxFinished])
	// And when a backup finishes, show it in the list of copies.
	const backupFinished = tasks.data?.tasks.find(
		(task) => task.id === "backup"
	)?.lastRun?.finishedAt
	useEffect(() => {
		if (backupFinished) {
			void queryClient.invalidateQueries({ queryKey: backupsKey })
		}
	}, [backupFinished])

	async function run(task: TaskInfo) {
		setStarting(task.id)
		try {
			const data = await adminFetch<{ tasks: TaskInfo[] }>(
				`tasks/${task.id}/run`,
				{ method: "POST" }
			)
			queryClient.setQueryData(tasksKey, data)
			void queryClient.invalidateQueries({ queryKey: auditKey })
			toast.success(`${task.label} started`)
		} catch (error) {
			toast.error((error as Error).message)
		} finally {
			setStarting(null)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<ListChecks className="size-4 text-muted-foreground" />{" "}
					Tasks
				</CardTitle>
				<CardDescription>
					Jobs that run in the background on their own. Run one now if
					you don’task want to wait.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				{tasks.isPending && <Skeleton className="h-16 w-full" />}
				{tasks.error && (
					<p className="text-sm text-destructive">
						{tasks.error.message}
					</p>
				)}
				{tasks.data?.tasks
					.filter((task) => showBackupTask || task.id !== "backup")
					.map((task) => {
						const last = task.lastRun
						return (
							<div
								key={task.id}
								className="flex flex-wrap items-start gap-3 rounded-lg border p-3"
							>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium">
											{task.label}
										</span>
										<Badge variant="secondary">
											{every(task.intervalMs)}
										</Badge>
										{task.running ? (
											<Badge
												variant="outline"
												className="gap-1"
											>
												<Loader2 className="size-3 animate-spin" />{" "}
												Running
											</Badge>
										) : last?.status === "error" ? (
											<Badge variant="destructive">
												Failed
											</Badge>
										) : null}
									</div>
									<p className="mt-0.5 text-sm text-muted-foreground">
										{task.description}
									</p>
									<p className="mt-1.5 text-xs text-muted-foreground">
										{last ? (
											<>
												Last run{" "}
												<Hint
													label={formatTimestamp(
														last.startedAt
													)}
												>
													<span className="cursor-default text-foreground">
														{formatRelative(
															last.startedAt
														)}
													</span>
												</Hint>
												{last.trigger === "manual" &&
													" (run by hand)"}
												{last.durationMs !== null &&
													` · took ${took(last.durationMs)}`}
												{last.summary &&
													` · ${last.summary}`}
											</>
										) : (
											"Hasn’task run yet"
										)}
										{!task.running && task.nextRunAt && (
											<>
												{" "}
												· next{" "}
												{formatRelative(task.nextRunAt)}
											</>
										)}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={
										task.running || starting === task.id
									}
									onClick={() => void run(task)}
								>
									{starting === task.id ? (
										<Loader2 className="animate-spin" />
									) : (
										<CirclePlay />
									)}{" "}
									Run now
								</Button>
							</div>
						)
					})}
			</CardContent>
		</Card>
	)
}
