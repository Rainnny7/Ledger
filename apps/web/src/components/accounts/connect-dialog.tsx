import { Dialog, DialogContent } from "@/components/ui/dialog"
import { api } from "@/lib/api"
import type { ProviderId } from "@/components/accounts/providers"
import { ConnectDialogHeader } from "@/components/accounts/connect/connect-header"
import {
	ConnectFormScreen,
	ConnectMfaCodeScreen,
	ConnectMfaPushScreen,
	ConnectMfaSelectScreen,
	ConnectPickScreen,
	ConnectSyncingScreen,
	ConnectTdMethodScreen,
} from "@/components/accounts/connect/connect-phases"
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
	/** Offered on the pick screen: add TD history from statement files instead of signing in. */
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

	const start = (
		provider: ProviderId,
		body: Parameters<typeof api.connect>[1]
	) => state.start(provider, body)

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
				<ConnectDialogHeader
					picking={state.picking}
					choosingTd={state.choosingTd}
					provider={state.provider}
					resync={state.resync}
					full={full}
					connectionUsername={connection?.usernameMasked}
					label={state.meta.label}
				/>

				{state.picking && (
					<ConnectPickScreen
						onUploadStatements={onUploadStatements}
						setProvider={state.setProvider}
						setRemember={state.setRemember}
						setPhase={state.setPhase}
					/>
				)}

				{state.choosingTd && (
					<ConnectTdMethodScreen
						onUploadStatements={onUploadStatements}
						setPhase={state.setPhase}
					/>
				)}

				{state.phase.type === "form" && (
					<ConnectFormScreen
						phase={state.phase}
						provider={state.provider}
						resync={state.resync}
						busy={state.busy}
						username={state.username}
						setUsername={state.setUsername}
						password={state.password}
						setPassword={state.setPassword}
						remember={state.remember}
						setRemember={state.setRemember}
						onUploadStatements={onUploadStatements}
						setPhase={state.setPhase}
						start={start}
						connectionId={connection?.id}
						full={full}
					/>
				)}

				{(state.phase.type === "syncing" ||
					state.phase.type === "success") && (
					<ConnectSyncingScreen
						phase={state.phase}
						historyLabel={state.meta.history}
					/>
				)}

				{state.phase.type === "mfa_select" && state.sessionId && (
					<ConnectMfaSelectScreen
						phase={state.phase}
						sessionId={state.sessionId}
						busy={state.busy}
						mfaChoice={state.mfaChoice}
						setMfaChoice={state.setMfaChoice}
						call={state.call}
					/>
				)}

				{state.phase.type === "mfa_code" && state.sessionId && (
					<ConnectMfaCodeScreen
						phase={state.phase}
						sessionId={state.sessionId}
						busy={state.busy}
						code={state.code}
						setCode={state.setCode}
						call={state.call}
					/>
				)}

				{state.phase.type === "mfa_push" && (
					<ConnectMfaPushScreen phase={state.phase} />
				)}
			</DialogContent>
		</Dialog>
	)
}
