import { InstitutionBadge } from "@/components/accounts/institution"
import { AccountCard } from "@/components/dashboard/account-card"
import { ConnectionAttentionBanner } from "@/components/dashboard/connection-section-attention"
import {
	ConnectionOptionsMenuItems,
	ConnectionRefreshMenuItems,
} from "@/components/dashboard/connection-section-menus"
import { RefreshButton } from "@/components/dashboard/refresh-button"
import { Hint } from "@/components/common/hint"
import { WithContextMenu } from "@/components/layout/app-context-menu"
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
import { cn } from "cn"
import { SyncTime } from "@/components/transactions/tx-bits"
import { ChevronDown, MoreHorizontal, RefreshCw, Zap } from "lucide-react"

/** One bank connection: its status, sync actions and the accounts it provides. */
export function ConnectionSection({
	connection,
	accounts,
	onRefresh,
	onFullRefresh,
	onUploadStatements,
	onToggleInstant,
	onForget,
	onRemove,
}: {
	connection: Connection
	accounts: Account[]
	onRefresh: (connection: Connection) => void
	onFullRefresh: (connection: Connection) => void
	onUploadStatements: (connectionId: string) => void
	onToggleInstant: (connection: Connection) => void
	onForget: (connection: Connection) => void
	onRemove: (connection: Connection) => void
}) {
	const attention = Boolean(connection.lastError || connection.needsSignIn)

	return (
		<section
			id={`connection-${connection.id}`}
			className={cn(
				"grid scroll-mt-4 gap-3",
				attention &&
					"-mx-3 rounded-xl border border-destructive/40 bg-destructive/[0.03] p-3 shadow-[0_0_0_4px] shadow-destructive/5"
			)}
		>
			<WithContextMenu
				className="w-64"
				menu={
					<>
						<DropdownMenuItem onClick={() => onRefresh(connection)}>
							<RefreshCw /> Refresh
						</DropdownMenuItem>
						<ConnectionRefreshMenuItems
							connection={connection}
							onFullRefresh={onFullRefresh}
							onUploadStatements={onUploadStatements}
						/>
						<DropdownMenuSeparator />
						<ConnectionOptionsMenuItems
							connection={connection}
							onToggleInstant={onToggleInstant}
							onForget={onForget}
							onRemove={onRemove}
						/>
					</>
				}
			>
				<div className="flex items-center gap-3">
					<InstitutionBadge
						institution={connection.institution}
						className="size-8"
					/>
					<div className="min-w-0 flex-1">
						<div className="font-medium">{connection.label}</div>
						<div className="text-xs text-muted-foreground">
							{connection.usernameMasked} ·{" "}
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
					<div className="flex">
						<RefreshButton onClick={() => onRefresh(connection)} />
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="outline"
										size="icon-sm"
										className="-ml-px rounded-l-none"
										aria-label="More refresh options"
									/>
								}
							>
								<ChevronDown />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-64">
								<ConnectionRefreshMenuItems
									connection={connection}
									onFullRefresh={onFullRefresh}
									onUploadStatements={onUploadStatements}
								/>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label="Connection options"
								/>
							}
						>
							<MoreHorizontal />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-64">
							<ConnectionOptionsMenuItems
								connection={connection}
								onToggleInstant={onToggleInstant}
								onForget={onForget}
								onRemove={onRemove}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</WithContextMenu>

			{attention ? (
				<ConnectionAttentionBanner
					connection={connection}
					onRefresh={onRefresh}
				/>
			) : null}

			<div className="grid gap-3 sm:grid-cols-2">
				{accounts
					.filter((account) => account.connectionId === connection.id)
					.map((account) => (
						<AccountCard key={account.id} account={account} />
					))}
			</div>
		</section>
	)
}
