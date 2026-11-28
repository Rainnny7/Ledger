import { KeyRoundIcon } from "@/components/icons/key-round"
import { Button } from "@/components/ui/button"
import type { Connection } from "@/lib/api"
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react"

/** Banner when a connection needs sign-in or the last refresh failed. */
export function ConnectionAttentionBanner({
	connection,
	onRefresh,
}: {
	connection: Connection
	onRefresh: (connection: Connection) => void
}) {
	const failed = Boolean(connection.lastError)
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
			<span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
				{failed ? (
					<AlertTriangle className="size-4" />
				) : (
					<ShieldAlert className="size-4" />
				)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="font-medium text-destructive">
					{failed
						? "Last refresh failed"
						: `${connection.label} wants a two-factor code`}
				</div>
				<div className="text-xs text-destructive/80">
					{connection.lastError ??
						"Auto-refresh is paused until you log in once. Your transactions won’t update on their own until then."}
				</div>
			</div>
			<Button
				variant="destructive"
				size="sm"
				onClick={() => onRefresh(connection)}
			>
				{failed ? (
					<RefreshCw />
				) : (
					<KeyRoundIcon size={24} className="flex" />
				)}{" "}
				{failed ? "Try again" : "Log in"}
			</Button>
		</div>
	)
}
