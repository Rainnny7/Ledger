import { toast } from "sonner"
import { confirmDialog } from "@/lib/confirm"
import { api, type Connection } from "@/lib/api"
import { demoMode } from "@/lib/demo"
import { toastError } from "@/lib/toast"

/** Asks for confirmation, then deletes a connection with its accounts and transactions. */
export async function removeConnection(connection: Connection) {
	if (
		!(await confirmDialog({
			title: `Remove ${connection.label}?`,
			description:
				"Its accounts, transactions and saved login are deleted from Ledger. Your bank account itself isn’t touched.",
			action: "Remove",
			destructive: true,
		}))
	) {
		return
	}
	await api.deleteConnection(connection.id)
	toast.success("Connection removed")
}

/** Turns PayPal instant updates (webhooks) on or off for a connection. */
export async function toggleInstant(connection: Connection) {
	if (demoMode) {
		return toastError(
			"Demo mode is read-only. Exit demo mode to make changes."
		)
	}
	try {
		if (connection.instantUpdates) {
			await api.disableInstantUpdates(connection.id)
			toast.success("Instant updates turned off")
		} else {
			await api.enableInstantUpdates(connection.id)
			toast.success("Instant updates on", {
				description:
					"PayPal will notify Ledger about payments made through your PayPal app, like invoice checkouts.",
			})
		}
	} catch (error) {
		toastError(
			error instanceof Error
				? error.message
				: "Could not change instant updates"
		)
	}
}

/** Deletes the login saved for a connection so refreshes ask for it again. */
export async function forgetCredentials(connection: Connection) {
	await api.forgetCredentials(connection.id)
	toast.success("Saved credentials deleted")
}
