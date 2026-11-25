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

export function ConnectDialog({
  open,
  onOpenChange,
  connection,
  full = false,
  onConnected,
  onUploadStatements,
}: Props) {
  const s = useConnectDialog({
    open,
    onOpenChange,
    connection,
    full,
    onConnected,
  })

  const start = (p: ProviderId, body: Parameters<typeof api.connect>[1]) =>
    s.start(p, body)

  return (
    <Dialog
      open={open}
      onOpenChange={s.close}
      disablePointerDismissal={s.locked}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!s.locked}>
        <ConnectDialogHeader
          picking={s.picking}
          choosingTd={s.choosingTd}
          provider={s.provider}
          resync={s.resync}
          full={full}
          connectionUsername={connection?.usernameMasked}
          label={s.meta.label}
        />

        {s.picking && (
          <ConnectPickScreen
            onUploadStatements={onUploadStatements}
            setProvider={s.setProvider}
            setRemember={s.setRemember}
            setPhase={s.setPhase}
          />
        )}

        {s.choosingTd && (
          <ConnectTdMethodScreen
            onUploadStatements={onUploadStatements}
            setPhase={s.setPhase}
          />
        )}

        {s.phase.type === "form" && (
          <ConnectFormScreen
            phase={s.phase}
            provider={s.provider}
            resync={s.resync}
            busy={s.busy}
            username={s.username}
            setUsername={s.setUsername}
            password={s.password}
            setPassword={s.setPassword}
            remember={s.remember}
            setRemember={s.setRemember}
            onUploadStatements={onUploadStatements}
            setPhase={s.setPhase}
            start={start}
            connectionId={connection?.id}
            full={full}
          />
        )}

        {(s.phase.type === "syncing" || s.phase.type === "success") && (
          <ConnectSyncingScreen phase={s.phase} historyLabel={s.meta.history} />
        )}

        {s.phase.type === "mfa_select" && s.sessionId && (
          <ConnectMfaSelectScreen
            phase={s.phase}
            sessionId={s.sessionId}
            busy={s.busy}
            mfaChoice={s.mfaChoice}
            setMfaChoice={s.setMfaChoice}
            call={s.call}
          />
        )}

        {s.phase.type === "mfa_code" && s.sessionId && (
          <ConnectMfaCodeScreen
            phase={s.phase}
            sessionId={s.sessionId}
            busy={s.busy}
            code={s.code}
            setCode={s.setCode}
            call={s.call}
          />
        )}

        {s.phase.type === "mfa_push" && (
          <ConnectMfaPushScreen phase={s.phase} />
        )}
      </DialogContent>
    </Dialog>
  )
}
