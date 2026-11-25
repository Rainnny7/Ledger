import { InstitutionBadge } from "@/components/accounts/institution"
import type { ProviderId } from "@/components/accounts/providers"
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function ConnectPickHeader() {
  return (
    <>
      <DialogTitle>Add an account</DialogTitle>
      <DialogDescription>Choose where your money lives.</DialogDescription>
    </>
  )
}

export function ConnectTdMethodHeader() {
  return (
    <div className="mb-1 flex items-center gap-3">
      <InstitutionBadge institution="td" />
      <div>
        <DialogTitle>TD Bank</DialogTitle>
        <DialogDescription>
          How do you want to bring in your TD accounts?
        </DialogDescription>
      </div>
    </div>
  )
}

export function ConnectProviderHeader({
  provider,
  resync,
  full,
  usernameMasked,
  label,
}: {
  provider: ProviderId
  resync: boolean
  full: boolean
  usernameMasked?: string
  label: string
}) {
  return (
    <div className="mb-1 flex items-center gap-3">
      <InstitutionBadge institution={provider} />
      <div>
        <DialogTitle>
          {resync
            ? full
              ? `Full refresh: ${label}`
              : `Refresh ${label}`
            : `Connect ${label}`}
        </DialogTitle>
        <DialogDescription>
          {resync
            ? `Signing in as ${usernameMasked}`
            : provider === "paypal"
              ? "Paste the Client ID and Secret of your PayPal REST app."
              : "Sign in with your EasyWeb username or Access Card."}
        </DialogDescription>
      </div>
    </div>
  )
}

export function ConnectDialogHeader(props: {
  picking: boolean
  choosingTd: boolean
  provider: ProviderId
  resync: boolean
  full: boolean
  connectionUsername?: string
  label: string
}) {
  return (
    <DialogHeader>
      {props.picking ? (
        <ConnectPickHeader />
      ) : props.choosingTd ? (
        <ConnectTdMethodHeader />
      ) : (
        <ConnectProviderHeader
          provider={props.provider}
          resync={props.resync}
          full={props.full}
          usernameMasked={props.connectionUsername}
          label={props.label}
        />
      )}
    </DialogHeader>
  )
}
