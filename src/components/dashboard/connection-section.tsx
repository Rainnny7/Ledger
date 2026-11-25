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

export function ConnectionSection({
  connection: c,
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
  onRefresh: (c: Connection) => void
  onFullRefresh: (c: Connection) => void
  onUploadStatements: (connectionId: string) => void
  onToggleInstant: (c: Connection) => void
  onForget: (c: Connection) => void
  onRemove: (c: Connection) => void
}) {
  const refreshItems = (
    <>
      <DropdownMenuItem onClick={() => onFullRefresh(c)}>
        <History />
        <div className="grid">
          <span>Force full refresh</span>
          <span className="text-xs text-muted-foreground">
            Re-read{" "}
            {isProviderId(c.institution)
              ? PROVIDERS[c.institution].history
              : "all"}{" "}
            of history
          </span>
        </div>
      </DropdownMenuItem>
      {c.institution === "td" && (
        <DropdownMenuItem onClick={() => onUploadStatements(c.id)}>
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
      {c.institution === "paypal" && (
        <>
          <DropdownMenuItem onClick={() => void onToggleInstant(c)}>
            {c.instantUpdates ? <ZapOff /> : <Zap />}
            <div className="grid">
              <span>
                {c.instantUpdates
                  ? "Turn off instant updates"
                  : "Turn on instant updates"}
              </span>
              <span className="text-xs text-muted-foreground">
                Webhooks for payments made through your PayPal app. Needs a
                public https PUBLIC_URL.
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {canForget(c) && (
        <DropdownMenuItem onClick={() => void onForget(c)}>
          <KeyRound /> Forget saved password
        </DropdownMenuItem>
      )}
      {canForget(c) && <DropdownMenuSeparator />}
      <DropdownMenuItem variant="destructive" onClick={() => void onRemove(c)}>
        <Trash2 /> Remove connection
      </DropdownMenuItem>
    </>
  )
  const attention = Boolean(c.lastError || c.needsSignIn)

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
            <DropdownMenuItem onClick={() => onRefresh(c)}>
              <RefreshCw /> Refresh
            </DropdownMenuItem>
            {refreshItems}
            <DropdownMenuSeparator />
            {optionItems}
          </>
        }
      >
        <div className="flex items-center gap-3">
          <InstitutionBadge institution={c.institution} className="size-8" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{c.label}</div>
            <div className="text-xs text-muted-foreground">
              {c.usernameMasked} ·{" "}
              <SyncTime
                at={c.lastSyncedAt}
                next={c.nextSyncAt}
                savedCredentials={c.savedCredentials}
                error={c.lastError}
                needsSignIn={c.needsSignIn}
              />
              {c.instantUpdates && (
                <>
                  {" · "}
                  <Hint label="PayPal sends Ledger webhooks for app payments">
                    <span className="cursor-default">
                      <Zap className="inline size-3 text-primary" /> instant
                      {c.lastEventAt
                        ? `, last event ${formatRelative(c.lastEventAt)}`
                        : ""}
                    </span>
                  </Hint>
                </>
              )}
            </div>
          </div>
          <div className="flex">
            <RefreshButton onClick={() => onRefresh(c)} />
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
            {c.lastError ? (
              <AlertTriangle className="size-4" />
            ) : (
              <ShieldAlert className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-destructive">
              {c.lastError
                ? "Last refresh failed"
                : `${c.label} wants a two-factor code`}
            </div>
            <div className="text-xs text-destructive/80">
              {c.lastError ??
                "Auto-refresh is paused until you sign in once. Your transactions won’t update on their own until then."}
            </div>
          </div>
          <Button variant="destructive" size="sm" onClick={() => onRefresh(c)}>
            {c.lastError ? <RefreshCw /> : <KeyRound />}{" "}
            {c.lastError ? "Try again" : "Sign in"}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {accounts
          .filter((a) => a.connectionId === c.id)
          .map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
      </div>
    </section>
  )
}
