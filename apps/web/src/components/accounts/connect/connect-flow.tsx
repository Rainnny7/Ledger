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
import {
	useConnectDialog,
	type UseConnectDialogOptions,
} from "@/components/accounts/connect/use-connect-dialog"

type ConnectFlowViewProps = {
	state: ReturnType<typeof useConnectDialog>
	connection?: UseConnectDialogOptions["connection"]
	full?: boolean
	onUploadStatements?: () => void
}

/**
 * Bank connect pick → MFA phases (no dialog chrome).
 * {@link ConnectDialog} passes hook state; onboarding uses {@link ConnectFlowStandalone}.
 */
export function ConnectFlow({
	state,
	connection,
	full = false,
	onUploadStatements,
}: ConnectFlowViewProps) {
	const start = (
		provider: ProviderId,
		body: Parameters<typeof api.connect>[1]
	) => state.start(provider, body)

	return (
		<>
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

			{state.phase.type === "done" && (
				<div className="flex animate-in flex-col items-center gap-3 py-8 text-center fade-in-0 zoom-in-95">
					<p className="text-sm font-medium">Account connected</p>
					<p className="max-w-xs text-xs text-muted-foreground">
						Your bank is linked. Continue setup when you are ready.
					</p>
				</div>
			)}
		</>
	)
}

export type ConnectFlowStandaloneProps = Omit<
	UseConnectDialogOptions,
	"onOpenChange"
> & {
	onOpenChange?: (open: boolean) => void
	onUploadStatements?: () => void
}

/** Owns connect hook state for inline surfaces (onboarding wizard). */
export function ConnectFlowStandalone({
	onUploadStatements,
	onOpenChange,
	...options
}: ConnectFlowStandaloneProps) {
	const noopOpenChange = (next: boolean) => {
		onOpenChange?.(next)
	}
	const state = useConnectDialog({
		...options,
		onOpenChange: noopOpenChange,
	})
	return (
		<ConnectFlow
			state={state}
			connection={options.connection}
			full={options.full}
			onUploadStatements={onUploadStatements}
		/>
	)
}