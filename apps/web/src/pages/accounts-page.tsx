import { useParams } from "@tanstack/react-router"
import { useDeferredValue, useMemo, useState } from "react"
import { AccountsPane } from "@/components/accounts/accounts-pane"
import { AccountsPicker } from "@/components/accounts/accounts-picker"
import { AccountsRail } from "@/components/accounts/accounts-rail"
import {
	signedBalance,
	useIncludeOverdraft,
} from "@/components/accounts/account-figures"
import { ConnectDialog } from "@/components/accounts/connect-dialog"
import {
	forgetCredentials,
	removeConnection,
	toggleInstant,
} from "@/components/accounts/connection-actions"
import type { ConnectionHandlers } from "@/components/accounts/connection-group"
import { StatementUploadDialog } from "@/components/accounts/statement-upload-dialog"
import { DashboardEmptyState } from "@/components/dashboard/empty-state"
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import type { Connection } from "@/lib/api"
import { inHomeCurrency } from "@/lib/currency"
import { useConverter } from "@/lib/converter-provider"
import { useOverview } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"

/**
 * Accounts: one master-detail page for `/accounts` and `/accounts/$id`. A rail lists every
 * connection and account (a picker below lg); the right pane shows the picked account's header
 * over the one shared transactions card.
 */
export function AccountsPage() {
	const { id } = useParams({ strict: false })
	const selectedId = id ?? null
	const deferredAccountId = useDeferredValue(selectedId)
	const { data, loading, error, reload } = useOverview()
	const converter = useConverter()
	const includeOverdraft = useIncludeOverdraft()
	const [dialog, setDialog] = useState<{
		open: boolean
		connection: Connection | null
		full?: boolean
	}>({ open: false, connection: null })
	const [upload, setUpload] = useState<{
		open: boolean
		connectionId?: string
	}>({ open: false })
	// From the command palette.
	useIntent("connect", () => setDialog({ open: true, connection: null }))
	useIntent("upload", () => setUpload({ open: true }))

	const connections = useMemo(() => data?.connections ?? [], [data])
	const accounts = useMemo(() => data?.accounts ?? [], [data])
	// Totals add up across currencies by restating every account in the home currency (today's rates).
	const netTotal = useMemo(
		() =>
			inHomeCurrency(accounts, [], converter).accounts.reduce(
				(sum, account) =>
					sum + signedBalance(account, includeOverdraft),
				0
			),
		[accounts, converter, includeOverdraft]
	)

	const handlers: ConnectionHandlers = {
		onRefresh: (connection) => setDialog({ open: true, connection }),
		onFullRefresh: (connection) =>
			setDialog({ open: true, connection, full: true }),
		onUploadStatements: (connectionId) =>
			setUpload({ open: true, connectionId }),
		onToggleInstant: toggleInstant,
		onForget: forgetCredentials,
		onRemove: removeConnection,
	}
	function addAccount() {
		setDialog({ open: true, connection: null })
	}

	let content
	if (error && !data) {
		content = (
			<QueryError message={error.message} onRetry={() => void reload()} />
		)
	} else if (loading && !data) {
		content = (
			<div className="grid gap-4 lg:grid-cols-[18rem_1fr] lg:gap-6">
				<Skeleton className="h-64 rounded-xl" />
				<Skeleton className="h-[32rem] rounded-xl" />
			</div>
		)
	} else if (connections.length === 0) {
		content = <DashboardEmptyState onAdd={addAccount} />
	} else {
		const navigation = {
			connections,
			accounts,
			selectedId,
			netTotal,
			homeCurrency: converter.home,
			handlers,
			onAddAccount: addAccount,
		}
		content = (
			<div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6">
				<div className="hidden lg:block">
					<AccountsRail {...navigation} />
				</div>
				<div className="lg:hidden">
					<AccountsPicker {...navigation} />
				</div>
				<AccountsPane
					accountId={deferredAccountId}
					connections={connections}
				/>
			</div>
		)
	}

	return (
		<div className="grid gap-4">
			<h1 className="sr-only">Accounts</h1>
			{content}

			<ConnectDialog
				open={dialog.open}
				connection={dialog.connection}
				full={dialog.full}
				onOpenChange={(open) =>
					setDialog((state) => ({ ...state, open }))
				}
				onUploadStatements={() => {
					setDialog((state) => ({ ...state, open: false }))
					setUpload({ open: true })
				}}
			/>

			<StatementUploadDialog
				open={upload.open}
				connectionId={upload.connectionId}
				onOpenChange={(open) =>
					setUpload((state) => ({ ...state, open }))
				}
			/>
		</div>
	)
}
