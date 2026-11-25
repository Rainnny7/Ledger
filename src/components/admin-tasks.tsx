import { useQuery } from "@tanstack/react-query"
import {
  CirclePlay,
  DatabaseBackup,
  Download,
  ListChecks,
  Loader2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Hint } from "@/components/hint"
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
import { adminFetch, auditKey, backupsKey, tasksKey } from "@/lib/admin"
import { formatRelative, formatTimestamp } from "@/lib/format"
import { queryClient } from "@/lib/queries"

interface TaskInfo {
  id: string
  label: string
  description: string
  intervalMs: number
  running: boolean
  nextRunAt: string | null
  lastRun: {
    startedAt: string
    finishedAt: string | null
    durationMs: number | null
    status: "running" | "ok" | "error"
    summary: string | null
    trigger: "schedule" | "manual"
  } | null
}

const every = (ms: number) => {
  const h = ms / 3_600_000
  return h >= 24 && h % 24 === 0
    ? h === 24
      ? "Daily"
      : `Every ${h / 24} days`
    : `Every ${h} hours`
}
const took = (ms: number) =>
  ms < 1000
    ? `${ms} ms`
    : ms < 60_000
      ? `${Math.round(ms / 1000)} s`
      : `${Math.round(ms / 60_000)} min`

export function TasksCard() {
  const tasks = useQuery({
    queryKey: tasksKey,
    queryFn: () => adminFetch<{ tasks: TaskInfo[] }>("tasks"),
    // Keep checking while something runs, so the result shows up when it's done.
    refetchInterval: (q) =>
      q.state.data?.tasks.some((t) => t.running) ? 3000 : 60_000,
  })
  const [starting, setStarting] = useState<string | null>(null)
  // When the exchange-rate task finishes, pick up the new rates everywhere in the app.
  const fxFinished = tasks.data?.tasks.find((t) => t.id === "fx-rates")?.lastRun
    ?.finishedAt
  useEffect(() => {
    if (fxFinished) void queryClient.invalidateQueries({ queryKey: ["fx"] })
  }, [fxFinished])
  // And when a backup finishes, show it in the list of copies.
  const backupFinished = tasks.data?.tasks.find((t) => t.id === "backup")
    ?.lastRun?.finishedAt
  useEffect(() => {
    if (backupFinished)
      void queryClient.invalidateQueries({ queryKey: backupsKey })
  }, [backupFinished])

  async function run(t: TaskInfo) {
    setStarting(t.id)
    try {
      const data = await adminFetch<{ tasks: TaskInfo[] }>(
        `tasks/${t.id}/run`,
        { method: "POST" }
      )
      queryClient.setQueryData(tasksKey, data)
      void queryClient.invalidateQueries({ queryKey: auditKey })
      toast.success(`${t.label} started`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setStarting(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" /> Tasks
        </CardTitle>
        <CardDescription>
          Jobs that run in the background on their own. Run one now if you don’t
          want to wait.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {tasks.isPending && <Skeleton className="h-16 w-full" />}
        {tasks.error && (
          <p className="text-sm text-destructive">{tasks.error.message}</p>
        )}
        {tasks.data?.tasks.map((t) => {
          const last = t.lastRun
          return (
            <div
              key={t.id}
              className="flex flex-wrap items-start gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.label}</span>
                  <Badge variant="secondary">{every(t.intervalMs)}</Badge>
                  {t.running ? (
                    <Badge variant="outline" className="gap-1">
                      <Loader2 className="size-3 animate-spin" /> Running
                    </Badge>
                  ) : last?.status === "error" ? (
                    <Badge variant="destructive">Failed</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t.description}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {last ? (
                    <>
                      Last run{" "}
                      <Hint label={formatTimestamp(last.startedAt)}>
                        <span className="cursor-default text-foreground">
                          {formatRelative(last.startedAt)}
                        </span>
                      </Hint>
                      {last.trigger === "manual" && " (run by hand)"}
                      {last.durationMs !== null &&
                        ` · took ${took(last.durationMs)}`}
                      {last.summary && ` · ${last.summary}`}
                    </>
                  ) : (
                    "Hasn’t run yet"
                  )}
                  {!t.running && t.nextRunAt && (
                    <> · next {formatRelative(t.nextRunAt)}</>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={t.running || starting === t.id}
                onClick={() => void run(t)}
              >
                {starting === t.id ? (
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

interface BackupInfo {
  name: string
  size: number
  createdAt: string
}

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Daily copies of the database the backup task keeps, each one a download away. */
export function BackupsCard() {
  const backups = useQuery({
    queryKey: backupsKey,
    queryFn: () => adminFetch<{ backups: BackupInfo[] }>("backups"),
  })
  const list = backups.data?.backups ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="size-4 text-muted-foreground" /> Backups
        </CardTitle>
        <CardDescription>
          A copy of the whole database is made every day; the most recent ones
          are kept. Download one to keep it somewhere else too.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {backups.isPending && <Skeleton className="h-16 w-full" />}
        {backups.error && (
          <p className="text-sm text-destructive">{backups.error.message}</p>
        )}
        {backups.data && list.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No backups yet. Run “Back up database” above to make the first one.
          </p>
        )}
        {list.length > 0 && (
          <ul className="grid gap-0.5 text-sm">
            {list.map((b) => (
              <li
                key={b.name}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
              >
                <Hint label={formatTimestamp(b.createdAt)}>
                  <span className="cursor-default font-medium">
                    {formatRelative(b.createdAt)}
                  </span>
                </Hint>
                <span className="text-xs text-muted-foreground">
                  {fileSize(b.size)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  nativeButton={false}
                  render={
                    <a
                      href={`/api/admin/backups/${encodeURIComponent(b.name)}`}
                      download={b.name}
                    />
                  }
                >
                  <Download /> Download
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
