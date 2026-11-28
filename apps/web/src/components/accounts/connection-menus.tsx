import { Trash2Icon } from "@/components/icons/trash-2"
import { KeyRoundIcon } from "@/components/icons/key-round"
import { isProviderId, PROVIDERS } from "@/components/accounts/providers"
import { canForget } from "@/components/accounts/connection-utils"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { Connection } from "@/lib/api"
import { History, Upload, Zap, ZapOff } from "lucide-react"

/** Refresh-related actions for a bank connection menu. */
export function ConnectionRefreshMenuItems({
	connection,
	onFullRefresh,
	onUploadStatements,
}: {
	connection: Connection
	onFullRefresh: (connection: Connection) => void
	onUploadStatements: (connectionId: string) => void
}) {
	const historyLabel = isProviderId(connection.institution)
		? PROVIDERS[connection.institution].history
		: "all"
	return (
		<>
			<DropdownMenuItem onClick={() => onFullRefresh(connection)}>
				<History />
				<div className="grid">
					<span>Force Full Refresh</span>
					<span className="text-xs text-muted-foreground">
						Re-read {historyLabel} of history
					</span>
				</div>
			</DropdownMenuItem>
			{connection.institution === "td" ? (
				<DropdownMenuItem
					onClick={() => onUploadStatements(connection.id)}
				>
					<Upload />
					<div className="grid">
						<span>Upload Statements</span>
						<span className="text-xs text-muted-foreground">
							Older history from PDF statements or a .zip
						</span>
					</div>
				</DropdownMenuItem>
			) : null}
		</>
	)
}

/** Connection settings actions (instant updates, forget, remove). */
export function ConnectionOptionsMenuItems({
	connection,
	onToggleInstant,
	onForget,
	onRemove,
}: {
	connection: Connection
	onToggleInstant: (connection: Connection) => void
	onForget: (connection: Connection) => void
	onRemove: (connection: Connection) => void
}) {
	return (
		<>
			{connection.institution === "paypal" ? (
				<>
					<DropdownMenuItem
						onClick={() => void onToggleInstant(connection)}
					>
						{connection.instantUpdates ? <ZapOff /> : <Zap />}
						<div className="grid">
							<span>
								{connection.instantUpdates
									? "Turn off instant updates"
									: "Turn on instant updates"}
							</span>
							<span className="text-xs text-muted-foreground">
								Webhooks for payments made through your PayPal
								app. Needs a public https PUBLIC_URL.
							</span>
						</div>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
				</>
			) : null}
			{canForget(connection) ? (
				<DropdownMenuItem onClick={() => void onForget(connection)}>
					<KeyRoundIcon size={24} className="flex" /> Forget saved
					password
				</DropdownMenuItem>
			) : null}
			{canForget(connection) ? <DropdownMenuSeparator /> : null}
			<DropdownMenuItem
				variant="destructive"
				onClick={() => void onRemove(connection)}
			>
				<Trash2Icon size={24} className="flex" /> Remove connection
			</DropdownMenuItem>
		</>
	)
}
