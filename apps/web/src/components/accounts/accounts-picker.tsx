import { useNavigate } from "@tanstack/react-router"
import { Landmark, Plus } from "lucide-react"
import { useState } from "react"
import type { AccountsNavProps } from "@/components/accounts/accounts-rail"
import { ConnectionHeader } from "@/components/accounts/connection-group"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

const ALL_ACCOUNTS = "all"

/**
 * Below lg the rail collapses to this: a select that switches between "All accounts" and each
 * account, an Add account button, and a toggle revealing every connection's menus.
 */
export function AccountsPicker({
	connections,
	accounts,
	selectedId,
	handlers,
	onAddAccount,
}: AccountsNavProps) {
	const navigate = useNavigate()
	const [showConnections, setShowConnections] = useState(false)
	const [previousSelectedId, setPreviousSelectedId] = useState(selectedId)
	if (selectedId !== previousSelectedId) {
		setPreviousSelectedId(selectedId)
		setShowConnections(false)
	}
	const items = [
		{ value: ALL_ACCOUNTS, label: "All accounts" },
		...accounts.map((account) => ({
			value: account.id,
			label: account.name,
		})),
	]

	return (
		<div className="grid gap-2">
			<div className="flex items-center gap-2">
				<Select
					items={items}
					value={selectedId ?? ALL_ACCOUNTS}
					onValueChange={(next) => {
						if (!next) {
							return
						}
						if (next === ALL_ACCOUNTS) {
							void navigate({ to: "/accounts" })
						} else {
							void navigate({
								to: "/accounts/$id",
								params: { id: next as string },
							})
						}
					}}
				>
					<SelectTrigger
						className="min-w-0 flex-1"
						aria-label="Account"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{items.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="outline"
					size="icon"
					aria-label="Connections"
					aria-pressed={showConnections}
					onClick={() => setShowConnections((open) => !open)}
				>
					<Landmark />
				</Button>
				<Button
					variant="outline"
					size="icon"
					aria-label="Add account"
					onClick={onAddAccount}
				>
					<Plus />
				</Button>
			</div>
			{showConnections ? (
				<Card className="gap-3 p-2">
					{connections.map((connection) => (
						<ConnectionHeader
							key={connection.id}
							connection={connection}
							handlers={handlers}
						/>
					))}
				</Card>
			) : null}
		</div>
	)
}
