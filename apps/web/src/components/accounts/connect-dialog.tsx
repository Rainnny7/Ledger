import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ConnectFlow } from "@/components/accounts/connect/connect-flow"
import { useConnectDialog } from "@/components/accounts/connect/use-connect-dialog"

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Re-sync an existing connection instead of adding a new one. */
	connection?: {
		id: string
		institution: string
		savedCredentials: boolean
		usernameMasked: string
	} | null
	/** Re-read the full history instead of only what's new since the last sync. */
	full?: boolean
	onConnected?: (connectionId: string) => void
	/** Offered on the pick screen: add TD history from statement files instead of logging in. */
	onUploadStatements?: () => void
}

/** React/UI entry: `ConnectDialog`. */
export function ConnectDialog({
	open,
	onOpenChange,
	connection,
	full = false,
	onConnected,
	onUploadStatements,
}: Props) {
	const state = useConnectDialog({
		open,
		onOpenChange,
		connection,
		full,
		onConnected,
	})

	return (
		<Dialog
			open={open}
			onOpenChange={state.close}
			disablePointerDismissal={state.locked}
		>
			<DialogContent
				className="sm:max-w-md"
				showCloseButton={!state.locked}
			>
				<ConnectFlow
					state={state}
					connection={connection}
					full={full}
					onUploadStatements={onUploadStatements}
				/>
			</DialogContent>
		</Dialog>
	)
}
