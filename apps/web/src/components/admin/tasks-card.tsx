import { useQuery } from "@tanstack/react-query"
import { CirclePlay, ListChecks, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Hint } from "@/components/common/hint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import {
	type TaskInfo,
	every,
	took,
	tookPrecisely,
} from "@/components/admin/task-types"
import { adminFetch, auditKey, backupsKey, tasksKey } from "@/lib/admin"
import { formatRelative, formatTimestamp } from "@/lib/format"
import { queryClient } from "@/lib/queries"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"

/** Inline editor for how many hours pass between runs of a task. */
function IntervalEditor({
	task,
	onSaved,
}: {
	task: TaskInfo
	onSaved: () => void
}) {
	const currentHours = task.intervalMs / 3_600_000
	const [draft, setDraft] = useState(String(currentHours))
	const [saving, setSaving] = useState(false)
	const hours = Number(draft)
	const valid = Number.isFinite(hours) && hours >= 0.25 && hours <= 168

	useEffect(() => {
		setDraft(String(currentHours))
	}, [currentHours])

	async function save() {
		setSaving(true)
		try {
			const data = await adminFetch<{ tasks: TaskInfo[] }>(
				`tasks/${task.id}/interval`,
				{ method: "PUT", body: JSON.stringify({ hours }) }
			)
			queryClient.setQueryData(tasksKey, data)
			void queryClient.invalidateQueries({ queryKey: auditKey })
			onSaved()
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="mt-2 flex items-center gap-2 text-sm">
			<label htmlFor={`interval-${task.id}`}>Run every</label>
			<Input
				id={`interval-${task.id}`}
				type="number"
				inputMode="decimal"
				min={0.25}
				max={168}
				step={0.25}
				className="h-8 w-20"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
			/>
			<span>hours</span>
			<Button
				variant="outline"
				size="sm"
				disabled={!valid || saving || hours === currentHours}
				onClick={() => void save()}
			>
				{saving && <Loader2 className="animate-spin" />} Save
			</Button>
		</div>
	)
}

/** Tooltip body: when a run started, how long it took, and how long each step took. */
function RunBreakdown({ run }: { run: NonNullable<TaskInfo["lastRun"]> }) {
	return (
		<div className="grid gap-1 text-left">
			<div>
				Started {formatTimestamp(run.startedAt)}
				{run.durationMs !== null &&
					` · took ${tookPrecisely(run.durationMs)}`}
			</div>
			{run.steps.length > 0 ? (
				<ul className="grid gap-0.5">
					{run.steps.map((step, index) => (
						<li key={index} className="flex justify-between gap-4">
							<span>{step.label}</span>
							<span className="tabular-nums">
								{tookPrecisely(step.durationMs)}
							</span>
						</li>
					))}
				</ul>
			) : (
				<div>No step breakdown for this task.</div>
			)}
		</div>
	)
}

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
	const { saved, flash } = useSavedFlash()
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
			flash()
		} catch (error) {
			toastError((error as Error).message)
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
					<SavedIndicator saved={saved} showLabel={false} />
				</CardTitle>
				<CardDescription>
					Jobs that run in the background on their own. Run one now if
					you don’task want to wait.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				{tasks.isPending && <Skeleton className="h-16 w-full" />}
				{tasks.error && !tasks.data && (
					<QueryError
						message={tasks.error.message}
						onRetry={() => void tasks.refetch()}
					/>
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
											<Hint
												label={
													<>
														Failed{" "}
														{formatTimestamp(
															last.finishedAt ??
																last.startedAt
														)}
														<br />
														{last.summary ??
															"No error details were recorded."}
													</>
												}
											>
												<Badge
													variant="destructive"
													className="cursor-default"
												>
													Failed
												</Badge>
											</Hint>
										) : null}
									</div>
									<p className="mt-0.5 text-sm text-muted-foreground">
										{task.description}
									</p>
									<IntervalEditor
										task={task}
										onSaved={flash}
									/>
									<Hint
										side="bottom"
										label={
											last ? (
												<RunBreakdown run={last} />
											) : null
										}
									>
										<p className="mt-1.5 w-fit cursor-default text-xs text-muted-foreground">
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
													{last.trigger ===
														"manual" &&
														" (run by hand)"}
													{last.durationMs !== null &&
														` · took ${took(last.durationMs)}`}
													{last.summary &&
														` · ${last.summary}`}
												</>
											) : (
												"Hasn’task run yet"
											)}
											{!task.running &&
												task.nextRunAt && (
													<>
														{" "}
														· next{" "}
														{formatRelative(
															task.nextRunAt
														)}
													</>
												)}
										</p>
									</Hint>
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
