import { InstitutionBadge } from "@/components/accounts/institution"
import { isProviderId, PROVIDERS } from "@/components/accounts/providers"
import { AccountCard } from "@/components/dashboard/account-card"
import { canForget } from "@/components/dashboard/connection-utils"
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
import {
	AlertTriangle,
	ChevronDown,
	History,
	KeyRound,
	MoreHorizontal,
	RefreshCw,
	ShieldAlert,
	Trash2,
	Upload,
	Zap,
	ZapOff,
} from "lucide-react"

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
	const refreshItems = (
		<>
			<DropdownMenuItem onClick={() => onFullRefresh(connection)}>
				<History />
				<div className="grid">
					<span>Force full refresh</span>
					<span className="text-xs text-muted-foreground">
						Re-read{" "}
						{isProviderId(connection.institution)
							? PROVIDERS[connection.institution].history
							: "all"}{" "}
						of history
					</span>
				</div>
			</DropdownMenuItem>
			{connection.institution === "td" && (
				<DropdownMenuItem
					onClick={() => onUploadStatements(connection.id)}
				>
					<Upload />
					<div className="grid">
						<span>Upload statements</span>
						<span className="text-xs text-muted-foreground">
							Older history from PDF statements or a .zip
						</span>
					</div>
				</DropdownMenuItem>
			)}
		</>
	)
	const optionItems = (
		<>
			{connection.institution === "paypal" && (
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
			)}
			{canForget(connection) && (
				<DropdownMenuItem onClick={() => void onForget(connection)}>
					<KeyRound /> Forget saved password
				</DropdownMenuItem>
			)}
			{canForget(connection) && <DropdownMenuSeparator />}
			<DropdownMenuItem
				variant="destructive"
				onClick={() => void onRemove(connection)}
			>
				<Trash2 /> Remove connection
			</DropdownMenuItem>
		</>
	)
	const attention = Boolean(connection.lastError || connection.needsSignIn)

	return (
		<section
			className={cn(
				"grid gap-3",
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
						{refreshItems}
						<DropdownMenuSeparator />
						{optionItems}
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
							{connection.instantUpdates && (
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
							)}
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
								{refreshItems}
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
							{optionItems}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</WithContextMenu>

			{attention && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm">
					<span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
						<span className="absolute inset-0 animate-ping rounded-full bg-destructive/20 [animation-duration:2s]" />
						{connection.lastError ? (
							<AlertTriangle className="size-4" />
						) : (
							<ShieldAlert className="size-4" />
						)}
					</span>
					<div className="min-w-0 flex-1">
						<div className="font-medium text-destructive">
							{connection.lastError
								? "Last refresh failed"
								: `${connection.label} wants a two-factor code`}
						</div>
						<div className="text-xs text-destructive/80">
							{connection.lastError ??
								"Auto-refresh is paused until you sign in once. Your transactions won’t update on their own until then."}
						</div>
					</div>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => onRefresh(connection)}
					>
						{connection.lastError ? <RefreshCw /> : <KeyRound />}{" "}
						{connection.lastError ? "Try again" : "Sign in"}
					</Button>
				</div>
			)}

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
