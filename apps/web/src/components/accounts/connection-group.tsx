import { MoreHorizontal, RefreshCw, Zap } from "lucide-react"
import { AccountRailRow } from "@/components/accounts/account-rail-row"
import { ConnectionAttentionBanner } from "@/components/accounts/connection-attention"
import {
	ConnectionOptionsMenuItems,
	ConnectionRefreshMenuItems,
} from "@/components/accounts/connection-menus"
import { InstitutionBadge } from "@/components/accounts/institution"
import { RefreshButton } from "@/components/accounts/refresh-button"
import { Hint } from "@/components/common/hint"
import { WithContextMenu } from "@/components/layout/app-context-menu"
import { SyncTime } from "@/components/transactions/tx-bits"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Account, Connection } from "@/lib/api"
import { formatRelative } from "@/lib/format"

/** What the connection menus can do; the Accounts page wires these to dialogs and the API. */
export type ConnectionHandlers = {
	onRefresh: (connection: Connection) => void
	onFullRefresh: (connection: Connection) => void
	onUploadStatements: (connectionId: string) => void
	onToggleInstant: (connection: Connection) => void
	onForget: (connection: Connection) => void
	onRemove: (connection: Connection) => void
}

/**
 * A bank connection's header: institution badge, label, one status line (synced time, errors,
 * instant updates), a compact refresh button and the menu with the remaining actions. The same
 * actions open from a right-click. A failing connection also shows its banner underneath.
 */
export function ConnectionHeader({
	connection,
	handlers,
}: {
	connection: Connection
	handlers: ConnectionHandlers
}) {
	const attention = Boolean(connection.lastError || connection.needsSignIn)
	return (
		<div className="grid gap-2" id={`connection-${connection.id}`}>
			<WithContextMenu
				className="w-64"
				menu={
					<>
						<DropdownMenuItem
							onClick={() => handlers.onRefresh(connection)}
						>
							<RefreshCw /> Refresh
						</DropdownMenuItem>
						<ConnectionRefreshMenuItems
							connection={connection}
							onFullRefresh={handlers.onFullRefresh}
							onUploadStatements={handlers.onUploadStatements}
						/>
						<DropdownMenuSeparator />
						<ConnectionOptionsMenuItems
							connection={connection}
							onToggleInstant={handlers.onToggleInstant}
							onForget={handlers.onForget}
							onRemove={handlers.onRemove}
						/>
					</>
				}
			>
				<div className="flex items-center gap-2.5 px-2.5">
					<InstitutionBadge
						institution={connection.institution}
						className="size-7 text-xs"
					/>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">
							{connection.label}
						</div>
						<div className="truncate text-xs text-muted-foreground">
							<SyncTime
								at={connection.lastSyncedAt}
								next={connection.nextSyncAt}
								savedCredentials={connection.savedCredentials}
								error={connection.lastError}
								needsSignIn={connection.needsSignIn}
							/>
							{connection.instantUpdates ? (
								<>
									{" · "}
									<Hint label="PayPal sends Ledger webhooks for app payments">
										<span className="cursor-default">
											<Zap className="inline size-3 text-primary" />{" "}
											instant
											{connection.lastEventAt
												? `, last event ${formatRelative(connection.lastEventAt)}`
												: ""}
										</span>
									</Hint>
								</>
							) : null}
						</div>
					</div>
					<RefreshButton
						onClick={() => handlers.onRefresh(connection)}
					/>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`${connection.label} options`}
								/>
							}
						>
							<MoreHorizontal />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-64">
							<ConnectionRefreshMenuItems
								connection={connection}
								onFullRefresh={handlers.onFullRefresh}
								onUploadStatements={handlers.onUploadStatements}
							/>
							<DropdownMenuSeparator />
							<ConnectionOptionsMenuItems
								connection={connection}
								onToggleInstant={handlers.onToggleInstant}
								onForget={handlers.onForget}
								onRemove={handlers.onRemove}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</WithContextMenu>
			{attention ? (
				<ConnectionAttentionBanner
					connection={connection}
					onRefresh={handlers.onRefresh}
				/>
			) : null}
		</div>
	)
}

/** One connection in the rail: its header followed by the accounts it provides. */
export function ConnectionGroup({
	connection,
	accounts,
	selectedId,
	handlers,
}: {
	connection: Connection
	accounts: Account[]
	selectedId: string | null
	handlers: ConnectionHandlers
}) {
	return (
		<section className="grid gap-1 pt-3">
			<ConnectionHeader connection={connection} handlers={handlers} />
			{accounts
				.filter((account) => account.connectionId === connection.id)
				.map((account) => (
					<AccountRailRow
						key={account.id}
						account={account}
						selected={account.id === selectedId}
					/>
				))}
		</section>
	)
}
