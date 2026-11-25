import { ChevronRight, ExternalLink, Loader2, LockKeyhole, ShieldCheck, Smartphone, Upload } from 'lucide-react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { InstitutionBadge, isProviderId, PROVIDERS, type ProviderId } from '@/components/institution'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { api, type ConnectStep, notifyDataChanged, type SessionView } from '@/lib/api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Re-sync an existing connection instead of adding a new one. */
  connection?: { id: string; institution: string; savedCredentials: boolean; usernameMasked: string } | null
  /** Re-read the full history instead of only what's new since the last sync. */
  full?: boolean
  onConnected?: (connectionId: string) => void
  /** Offered on the pick screen: add TD history from statement files instead of signing in. */
  onUploadStatements?: () => void
}

type Phase = { type: 'pick' } | { type: 'form'; error?: string } | ConnectStep

export function ConnectDialog({ open, onOpenChange, connection, full = false, onConnected, onUploadStatements }: Props) {
  const [provider, setProvider] = useState<ProviderId>('td')
  const [phase, setPhase] = useState<Phase>({ type: 'pick' })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [mfaChoice, setMfaChoice] = useState<string>('')
  const [code, setCode] = useState('')

  const onConnectedRef = useRef(onConnected)
  onConnectedRef.current = onConnected

  // Reset every time the dialog opens; auto-start re-syncs when credentials are saved.
  useEffect(() => {
    if (!open) return
    const p = connection && isProviderId(connection.institution) ? connection.institution : 'td'
    setProvider(p)
    setPhase(connection ? { type: 'form' } : { type: 'pick' })
    setSessionId(null)
    setPassword('')
    setCode('')
    setMfaChoice('')
    setUsername('')
    setRemember(connection?.savedCredentials ?? false)
    if (connection?.savedCredentials) void start(p, { connectionId: connection.id, full })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connection?.id, full])

  const meta = PROVIDERS[provider]

  function apply(view: SessionView) {
    setSessionId(view.sessionId)
    if (view.step.type === 'error') {
      setPhase({ type: 'form', error: view.step.message })
      setSessionId(null)
      return
    }
    if (view.step.type === 'mfa_select') setMfaChoice(view.step.options[0]?.id ?? '')
    if (view.step.type === 'done') {
      toast.success(`${meta.label} synced`)
      notifyDataChanged()
      onConnectedRef.current?.(view.step.connectionId)
      onOpenChange(false)
    }
    setPhase(view.step)
  }

  async function call(fn: () => Promise<SessionView>) {
    setBusy(true)
    try {
      apply(await fn())
    } catch (e) {
      setPhase({ type: 'form', error: (e as Error).message })
      setSessionId(null)
    } finally {
      setBusy(false)
    }
  }

  function start(p: ProviderId, body: Parameters<typeof api.connect>[1]) {
    setPhase({ type: 'syncing', message: `Connecting to ${PROVIDERS[p].label}…` })
    return call(() => api.connect(p, body))
  }

  // Poll while the server is working (logging in / reading accounts) or waiting on app approval.
  const polling = phase.type === 'syncing' || phase.type === 'success' || phase.type === 'mfa_push'
  useEffect(() => {
    if (!open || !sessionId || !polling || busy) return
    const t = setTimeout(() => void call(() => api.pollSession(sessionId)), phase.type === 'mfa_push' ? 300 : 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId, polling, busy, phase])

  // Once signed in, the bank is being read — closing now would abort the sync, so lock the dialog.
  const locked = phase.type === 'syncing' || phase.type === 'success' || (busy && phase.type !== 'form')

  function close(next: boolean) {
    if (!next && locked) return
    if (!next && sessionId && phase.type !== 'done') void api.cancelSession(sessionId).catch(() => {})
    onOpenChange(next)
  }

  const resync = !!connection
  const picking = phase.type === 'pick'

  return (
    <Dialog open={open} onOpenChange={close} disablePointerDismissal={locked}>
      <DialogContent className="sm:max-w-md" showCloseButton={!locked}>
        <DialogHeader>
          {picking ? (
            <>
              <DialogTitle>Add an account</DialogTitle>
              <DialogDescription>Choose where your money lives.</DialogDescription>
            </>
          ) : (
            <div className="mb-1 flex items-center gap-3">
              <InstitutionBadge institution={provider} />
              <div>
                <DialogTitle>
                  {resync ? (full ? `Full refresh: ${meta.label}` : `Refresh ${meta.label}`) : `Connect ${meta.label}`}
                </DialogTitle>
                <DialogDescription>
                  {resync
                    ? `Signing in as ${connection?.usernameMasked}`
                    : provider === 'paypal'
                      ? 'Paste the Client ID and Secret of your PayPal REST app.'
                      : 'Sign in with your EasyWeb username or Access Card.'}
                </DialogDescription>
              </div>
            </div>
          )}
        </DialogHeader>

        {picking && (
          <div className="grid gap-2">
            {(Object.keys(PROVIDERS) as ProviderId[]).map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setProvider(id)
                  setRemember(false)
                  setPhase({ type: 'form' })
                }}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group flex items-center gap-3 rounded-lg border p-3 text-left transition-all animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both hover:border-primary/40 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <InstitutionBadge institution={id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{PROVIDERS[id].label}</span>
                  <span className="block text-xs text-muted-foreground">{PROVIDERS[id].blurb}</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
            {onUploadStatements && (
              <button
                type="button"
                onClick={onUploadStatements}
                className="group flex items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-all animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both hover:border-primary/40 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                style={{ animationDelay: `${Object.keys(PROVIDERS).length * 60}ms` }}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Upload className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Upload TD statements</span>
                  <span className="block text-xs text-muted-foreground">PDF statements or a .zip, for history past 18 months</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        )}

        {phase.type === 'form' && (
          <form
            className="grid gap-4 animate-in fade-in-0 duration-200"
            onSubmit={(e) => {
              e.preventDefault()
              void start(provider, { username, password, remember, connectionId: connection?.id, full })
            }}
          >
            {phase.error && (
              <Alert variant="destructive">
                <AlertDescription>{phase.error}</AlertDescription>
              </Alert>
            )}
            {provider === 'paypal' ? <PaypalFields {...{ username, setUsername, password, setPassword }} /> : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="td-username">Username or Access Card</Label>
                  <Input
                    id="td-username"
                    autoComplete="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="td-password">Password</Label>
                  <Input
                    id="td-password"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} className="mt-0.5" />
                  <span>
                    Save credentials for one-click refresh
                    <span className="block text-xs text-muted-foreground">Encrypted with AES-256-GCM on this server.</span>
                  </span>
                </label>
                <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
                  Your credentials are sent only to your own server, which signs in to easyweb.td.com in a private browser.
                  TD may ask you to verify with a code.
                </p>
              </>
            )}
            <DialogFooter>
              {!resync && (
                <Button type="button" variant="ghost" onClick={() => setPhase({ type: 'pick' })}>
                  Back
                </Button>
              )}
              <Button type="submit" disabled={busy || !username || !password}>
                {busy && <Loader2 className="animate-spin" />}
                Connect
              </Button>
            </DialogFooter>
          </form>
        )}

        {(phase.type === 'syncing' || phase.type === 'success') && (
          <div className="flex flex-col items-center gap-3 py-8 text-center animate-in fade-in-0 zoom-in-95">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">{phase.type === 'syncing' ? phase.message : 'Signed in…'}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              The first sync reads {meta.history} of history and can take a few minutes. Please keep this window open.
            </p>
          </div>
        )}

        {phase.type === 'mfa_select' && sessionId && (
          <form
            className="grid gap-4 animate-in fade-in-0 duration-200"
            onSubmit={(e) => {
              e.preventDefault()
              void call(() => api.chooseMfa(sessionId, mfaChoice))
            }}
          >
            <div className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{phase.prompt || 'Your bank wants to verify it’s you. How should they send your security code?'}</p>
            </div>
            <RadioGroup value={mfaChoice} onValueChange={(v) => setMfaChoice(String(v))}>
              {phase.options.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/60 has-data-checked:border-primary has-data-checked:bg-muted"
                >
                  <RadioGroupItem value={o.id} />
                  {o.label}
                </label>
              ))}
            </RadioGroup>
            <DialogFooter>
              <Button type="submit" disabled={busy || !mfaChoice}>
                {busy && <Loader2 className="animate-spin" />}
                Send code
              </Button>
            </DialogFooter>
          </form>
        )}

        {phase.type === 'mfa_code' && sessionId && (
          <form
            className="grid gap-4 animate-in fade-in-0 duration-200"
            onSubmit={(e) => {
              e.preventDefault()
              void call(() => api.submitCode(sessionId, code))
            }}
          >
            <div className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>{phase.prompt}</p>
            </div>
            <div className="grid justify-center gap-2">
              <Label htmlFor="bank-code" className="sr-only">
                Security code
              </Label>
              <InputOTP
                id="bank-code"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                autoComplete="one-time-code"
                value={code}
                onChange={setCode}
                onComplete={(v: string) => {
                  if (!busy) void call(() => api.submitCode(sessionId, v))
                }}
                disabled={busy}
                autoFocus
              >
                <InputOTPGroup className="*:data-[slot=input-otp-slot]:size-11 *:data-[slot=input-otp-slot]:text-lg">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup className="*:data-[slot=input-otp-slot]:size-11 *:data-[slot=input-otp-slot]:text-lg">
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || code.length < 6}>
                {busy && <Loader2 className="animate-spin" />}
                Verify
              </Button>
            </DialogFooter>
          </form>
        )}

        {phase.type === 'mfa_push' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center animate-in fade-in-0 zoom-in-95">
            <Smartphone className="size-8 animate-pulse text-primary" />
            <p className="text-sm font-medium">{phase.prompt}</p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Waiting for approval…
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PaypalFields({
  username,
  setUsername,
  password,
  setPassword,
}: {
  username: string
  setUsername: (v: string) => void
  password: string
  setPassword: (v: string) => void
}) {
  return (
    <>
      <details className="group rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground select-none">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          How do I get these?
        </summary>
        <ol className="mt-2 ml-4 grid list-decimal gap-1.5 pb-1">
          <li>
            Sign in at{' '}
            <a
              href="https://developer.paypal.com/dashboard/applications/live"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
            >
              developer.paypal.com <ExternalLink className="size-3" />
            </a>{' '}
            with your PayPal account and switch to <b>Live</b>.
          </li>
          <li>
            Create an app (type <b>Merchant</b>), then under its features tick <b>Transaction Search</b> and save.
          </li>
          <li>Copy the app’s Client ID and Secret here.</li>
        </ol>
        <p className="mt-2">
          Transaction Search needs a PayPal Business account (free to upgrade to). New permissions and new payments can take up
          to 3 hours to show up.
        </p>
      </details>
      <div className="grid gap-2">
        <Label htmlFor="pp-client">Client ID</Label>
        <Input
          id="pp-client"
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value.trim())}
          required
          autoFocus
          className="font-mono text-xs"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pp-secret">Secret</Label>
        <Input
          id="pp-secret"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value.trim())}
          required
          className="font-mono text-xs"
        />
      </div>
      <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
        Ledger only reads balances and transactions. The keys are kept encrypted (AES-256-GCM) on your server so it can
        refresh; remove the connection or delete the app on PayPal to revoke access.
      </p>
    </>
  )
}
