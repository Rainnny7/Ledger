import { Plus } from "lucide-react"
import { AllAccountsRailRow } from "@/components/accounts/account-rail-row"
import {
	ConnectionGroup,
	type ConnectionHandlers,
} from "@/components/accounts/connection-group"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Account, Connection } from "@/lib/api"

/** What the rail and the mobile picker both need to list and manage accounts. */
export type AccountsNavProps = {
	connections: Connection[]
	accounts: Account[]
	/** The account open in the right pane, or null for "All accounts". */
	selectedId: string | null
	/** Net balance of every account, restated in the home currency. */
	netTotal: number
	homeCurrency: string
	handlers: ConnectionHandlers
	onAddAccount: () => void
}

/**
 * Left rail of the Accounts page (lg and up): "All accounts" with the net total, then each
 * connection with its accounts, and the Add account button. Sticks below the header while the
 * transactions scroll.
 */
export function AccountsRail({
	connections,
	accounts,
	selectedId,
	netTotal,
	homeCurrency,
	handlers,
	onAddAccount,
}: AccountsNavProps) {
	return (
		<Card className="sticky top-20 max-h-[calc(100svh-6rem)] gap-0 overflow-y-auto p-2">
			<AllAccountsRailRow
				accountCount={accounts.length}
				netTotal={netTotal}
				currency={homeCurrency}
				selected={selectedId === null}
			/>
			{connections.map((connection) => (
				<ConnectionGroup
					key={connection.id}
					connection={connection}
					accounts={accounts}
					selectedId={selectedId}
					handlers={handlers}
				/>
			))}
			<Button
				variant="outline"
				className="mt-3 w-full"
				data-tour="dashboard-connect"
				onClick={onAddAccount}
			>
				<Plus /> Add account
			</Button>
		</Card>
	)
}
