import { useQuery } from "@tanstack/react-query"
import { DownloadIcon } from "@/components/icons/download"
import { SaveIcon } from "@/components/icons/save"
import { CalendarClockIcon } from "@/components/icons/calendar-clock"
import { DatabaseBackup, Hand } from "lucide-react"
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
import { BackUpDialog } from "@/components/admin/backup-dialog"
import {
	type BackupInfo,
	fileSize,
	reasonText,
} from "@/components/admin/backup-types"
import { adminFetch, backupsKey } from "@/lib/admin"
import { formatRelative, formatTimestamp } from "@/lib/format"

/** Daily copies of the database the backup task keeps, each one a download away. */
export function BackupsCard() {
	const backups = useQuery({
		queryKey: backupsKey,
		queryFn: () =>
			adminFetch<{ backups: BackupInfo[]; kept: number }>("backups"),
	})
	const list = backups.data?.backups ?? []
	const [open, setOpen] = useState(false)
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<DatabaseBackup className="size-4 text-muted-foreground" />{" "}
					Backups
				</CardTitle>
				<CardDescription>
					A copy of the whole database is made every day; the most
					recent {backups.data?.kept ?? ""} are kept. DownloadIcon one
					to keep it somewhere else too.
				</CardDescription>
				<CardAction>
					<Button size="sm" onClick={() => setOpen(true)}>
						<SaveIcon size={24} className="flex" /> Back up now
					</Button>
				</CardAction>
			</CardHeader>
			<BackUpDialog open={open} onOpenChange={setOpen} />
			<CardContent>
				{backups.isPending && <Skeleton className="h-16 w-full" />}
				{backups.error && !backups.data && (
					<QueryError
						message={backups.error.message}
						onRetry={() => void backups.refetch()}
					/>
				)}
				{backups.data && list.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No backups yet. Use “Back up now” to make the first one.
					</p>
				)}
				{list.length > 0 && (
					<ul className="grid gap-0.5 text-sm">
						{list.map((backup) => (
							<li
								key={backup.name}
								className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
							>
								{backup.reason?.kind === "schedule" ? (
									<CalendarClockIcon
										size={16}
										className="flex shrink-0 text-muted-foreground"
									/>
								) : (
									<Hand className="size-4 shrink-0 text-muted-foreground" />
								)}
								<div className="grid min-w-0">
									<span className="flex flex-wrap items-baseline gap-x-2">
										<Hint
											label={formatTimestamp(
												backup.createdAt
											)}
										>
											<span className="cursor-default font-medium">
												{formatRelative(
													backup.createdAt
												)}
											</span>
										</Hint>
										<span className="text-xs text-muted-foreground">
											{fileSize(backup.size)}
										</span>
									</span>
									<span className="truncate text-xs text-muted-foreground">
										{reasonText(backup.reason)}
									</span>
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="ml-auto"
									nativeButton={false}
									render={
										<a
											href={`/api/admin/backups/${encodeURIComponent(backup.name)}`}
											download={backup.name}
										/>
									}
								>
									<DownloadIcon size={24} className="flex" />{" "}
									Download
								</Button>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	)
}
