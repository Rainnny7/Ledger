import { useQuery } from '@tanstack/react-query'
import { Copy, Download, Laptop, Loader2, LogOut, ShieldCheck, ShieldOff, Smartphone, Trash2 } from 'lucide-react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { isStrongPassword, PASSWORD_MAX, PasswordRules } from '@/components/password-rules'
import { QrCode } from '@/components/qr-code'
import { Switch } from '@/components/ui/switch'
import { CurrencySelect } from '@/components/currency-select'
import { authClient, twoFactor, useSession } from '@/lib/auth-client'
import { currencyName, useFx, useHomeCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/queries'

export function SettingsPage() {
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Preferences, security and your account.</p>
      </div>
      <PreferencesCard />
      <ChangePasswordCard />
      <TwoFactorCard />
      <DevicesCard />
      <DeleteAccountCard />
    </div>
  )
}

// ---------------------------------------------------------------- preferences

function PreferencesCard() {
  const { data } = useSession()
  const saved = (data?.user as { includeOverdraft?: boolean | null } | undefined)?.includeOverdraft ?? true
  // Shown straight away; the session catches up once the server has it.
  const [pending, setPending] = useState<boolean | null>(null)
  const checked = pending ?? saved

  async function toggle(value: boolean) {
    setPending(value)
    const { error } = await authClient.updateUser({ includeOverdraft: value })
    if (error) toast.error(error.message ?? 'Could not save that')
    else await queryClient.invalidateQueries()
    setPending(null)
  }

  const home = useHomeCurrency()
  const fx = useFx()
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)
  async function changeCurrency(code: string) {
    setPendingCurrency(code)
    const { error } = await authClient.updateUser({ currency: code })
    if (error) toast.error(error.message ?? 'Could not save that')
    else {
      toast.success(`Totals now show in ${currencyName(code)}`)
      await queryClient.invalidateQueries()
    }
    setPendingCurrency(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>How Ledger shows your money.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Label htmlFor="pref-currency" className="grid flex-1 basis-64 gap-1 font-normal">
            <span className="font-medium">Default currency</span>
            <span className="text-sm text-muted-foreground">
              Totals across accounts, goals, subscriptions and jobs are shown in this currency, converting others at
              daily reference rates{fx?.date ? ` (last updated ${formatDate(fx.date)})` : ''}. New goals, subscriptions
              and jobs start in it too.
            </span>
          </Label>
          <CurrencySelect
            id="pref-currency"
            value={pendingCurrency ?? home}
            onChange={(c) => void changeCurrency(c)}
            disabled={pendingCurrency !== null}
            className="w-56"
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <Label htmlFor="pref-overdraft" className="grid gap-1 font-normal">
            <span className="font-medium">Include overdraft in balances</span>
            <span className="text-sm text-muted-foreground">
              Count the overdraft you can still draw on as part of your balance: totals, charts and the balance after
              each transaction. Turn off to see what the bank reports.
            </span>
          </Label>
          <Switch id="pref-overdraft" checked={checked} disabled={pending !== null} onCheckedChange={(v) => void toggle(v)} />
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- password

function ChangePasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const sameAsOld = next.length > 0 && next === current
  const valid = current.length > 0 && isStrongPassword(next) && next === confirm && !sameAsOld

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: signOutOthers,
    })
    setBusy(false)
    if (error) {
      setError(
        error.code === 'INVALID_PASSWORD' ? 'Your current password is wrong.' : (error.message ?? 'Could not change your password'),
      )
      return
    }
    setCurrent('')
    setNext('')
    setConfirm('')
    toast.success(signOutOthers ? 'Password changed. Other devices were signed out.' : 'Password changed')
    void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change the password you sign in to Ledger with.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          {error && (
            <Alert variant="destructive" className="animate-in fade-in-0 duration-200">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2 sm:max-w-sm">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                aria-invalid={sameAsOld || undefined}
                aria-describedby="new-password-rules"
                maxLength={PASSWORD_MAX}
                required
              />
              {sameAsOld ? (
                <p className="text-xs text-destructive">Pick something different from your current password.</p>
              ) : (
                <PasswordRules id="new-password-rules" password={next} className="sm:grid-cols-1" />
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
              <Input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={mismatch || undefined}
                required
              />
              {mismatch && <p className="text-xs text-destructive animate-in fade-in-0 duration-200">Passwords don’t match.</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={signOutOthers} onCheckedChange={(v) => setSignOutOthers(v === true)} />
              Sign out my other devices
            </Label>
            <Button type="submit" disabled={busy || !valid}>
              {busy && <Loader2 className="animate-spin" />} Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- two-factor

type SetupStep = { type: 'password' } | { type: 'scan'; uri: string; backupCodes: string[] } | { type: 'codes'; backupCodes: string[] }

function TwoFactorCard() {
  const { data } = useSession()
  const enabled = !!(data?.user as { twoFactorEnabled?: boolean | null } | undefined)?.twoFactorEnabled
  const [dialog, setDialog] = useState<null | 'setup' | 'disable' | 'codes'>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor authentication
          {enabled ? <Badge>On</Badge> : <Badge variant="secondary">Off</Badge>}
        </CardTitle>
        <CardDescription>
          Ask for a code from an authenticator app (1Password, Google Authenticator, Authy…) every time you sign in on a
          new device.
        </CardDescription>
        <CardAction className="flex gap-2">
          {enabled ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog('codes')}>
                New backup codes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('disable')}>
                <ShieldOff /> Turn off
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setDialog('setup')}>
              <ShieldCheck /> Set up
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <SetupDialog open={dialog === 'setup'} onClose={() => setDialog(null)} />
      <PasswordDialog
        open={dialog === 'disable'}
        onClose={() => setDialog(null)}
        title="Turn off two-factor authentication?"
        description="Signing in will only need your password. Your backup codes stop working."
        action="Turn off"
        destructive
        run={async (password) => {
          const { error } = await twoFactor.disable({ password })
          if (error) return error.message ?? 'Could not turn off 2FA'
          toast.success('Two-factor authentication turned off')
          return null
        }}
      />
      <RegenerateCodesDialog open={dialog === 'codes'} onClose={() => setDialog(null)} />
    </Card>
  )
}

function SetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<SetupStep>({ type: 'password' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setStep({ type: 'password' })
    setPassword('')
    setCode('')
    setError(null)
  }

  async function begin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await twoFactor.enable({ password })
    setBusy(false)
    setPassword('')
    if (error || !data || !('totpURI' in data)) return setError(error?.message ?? 'Could not start setup')
    setStep({ type: 'scan', uri: data.totpURI, backupCodes: data.backupCodes })
  }

  async function verify(value: string) {
    if (step.type !== 'scan' || busy) return
    setBusy(true)
    setError(null)
    const { error } = await twoFactor.verifyTotp({ code: value })
    setBusy(false)
    if (error) {
      setCode('')
      return setError(error.message ?? 'That code didn’t match. Try the next one.')
    }
    setStep({ type: 'codes', backupCodes: step.backupCodes })
    toast.success('Two-factor authentication is on')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose()
          reset()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up two-factor authentication</DialogTitle>
          <DialogDescription>
            {step.type === 'password' && 'Confirm your password to continue.'}
            {step.type === 'scan' && 'Scan this with your authenticator app, then enter the 6-digit code it shows.'}
            {step.type === 'codes' && 'Save these backup codes somewhere safe. Each one signs you in once if you lose your phone.'}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {step.type === 'password' && (
          <form onSubmit={begin} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="2fa-password">Password</Label>
              <Input
                id="2fa-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !password}>
                {busy && <Loader2 className="animate-spin" />} Continue
              </Button>
            </DialogFooter>
          </form>
        )}
        {step.type === 'scan' && (
          <div className="grid justify-items-center gap-4">
            <QrCode value={step.uri} label="QR code for your authenticator app" className="size-48 rounded-lg p-2" />
            <details className="w-full text-xs text-muted-foreground">
              <summary className="cursor-pointer">Can’t scan? Enter the key manually</summary>
              <code className="mt-2 block rounded-md bg-muted p-2 break-all text-foreground">{secretOf(step.uri)}</code>
            </details>
            <InputOTP
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              autoComplete="one-time-code"
              value={code}
              onChange={setCode}
              onComplete={(v: string) => void verify(v)}
              disabled={busy}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}
        {step.type === 'codes' && (
          <>
            <BackupCodes codes={step.backupCodes} />
            <DialogFooter>
              <Button
                onClick={() => {
                  onClose()
                  reset()
                }}
              >
                I’ve saved them
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RegenerateCodesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null)
  if (codes) {
    return (
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            onClose()
            setCodes(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New backup codes</DialogTitle>
            <DialogDescription>Your old codes no longer work. Save these somewhere safe.</DialogDescription>
          </DialogHeader>
          <BackupCodes codes={codes} />
          <DialogFooter>
            <Button
              onClick={() => {
                onClose()
                setCodes(null)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <PasswordDialog
      open={open}
      onClose={onClose}
      keepOpen
      title="Generate new backup codes?"
      description="Your current backup codes will stop working."
      action="Generate"
      run={async (password) => {
        const { data, error } = await twoFactor.generateBackupCodes({ password })
        if (error || !data) return error?.message ?? 'Could not generate codes'
        setCodes(data.backupCodes)
        return null
      }}
    />
  )
}

function BackupCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n')
  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-3 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => toast.success('Copied'),
              () => toast.error('Could not copy'),
            )
          }
        >
          <Copy /> Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`Ledger backup codes\n\n${text}\n`], { type: 'text/plain' }))
            const a = document.createElement('a')
            a.href = url
            a.download = 'ledger-backup-codes.txt'
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }}
        >
          <Download /> Download
        </Button>
      </div>
    </div>
  )
}

/** The base32 secret inside an otpauth:// URI, grouped in fours for typing. */
function secretOf(uri: string) {
  try {
    return (new URL(uri).searchParams.get('secret') ?? '').replace(/(.{4})/g, '$1 ').trim()
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------- devices

interface DeviceSession {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

function DevicesCard() {
  const { data: current } = useSession()
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => {
      const { data, error } = await authClient.listSessions()
      if (error) throw new Error(error.message ?? 'Could not load devices')
      return (data as DeviceSession[]).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    },
  })
  const [busy, setBusy] = useState<string | null>(null)
  const currentId = current?.session.id
  const others = (sessions.data ?? []).filter((s) => s.id !== currentId)

  async function revoke(s: DeviceSession) {
    setBusy(s.id)
    const { error } = await authClient.revokeSession({ token: s.token })
    setBusy(null)
    if (error) toast.error(error.message ?? 'Could not sign out that device')
    else toast.success('Device signed out')
    void sessions.refetch()
  }

  async function revokeOthers() {
    setBusy('others')
    const { error } = await authClient.revokeOtherSessions()
    setBusy(null)
    if (error) toast.error(error.message ?? 'Could not sign out other devices')
    else toast.success('Signed out everywhere else')
    void sessions.refetch()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
        <CardDescription>Browsers signed in to your account. Sign out any you don’t recognise.</CardDescription>
        {others.length > 0 && (
          <CardAction>
            <Button variant="outline" size="sm" disabled={busy === 'others'} onClick={() => void revokeOthers()}>
              {busy === 'others' ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out others
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-1">
        {sessions.isPending && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {sessions.error && <p className="text-sm text-destructive">{sessions.error.message}</p>}
        {sessions.data?.map((s) => {
          const device = describeAgent(s.userAgent)
          const Icon = device.mobile ? Smartphone : Laptop
          const isCurrent = s.id === currentId
          return (
            <div key={s.id} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
              <Icon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {device.label}
                  {isCurrent && <Badge variant="secondary">This device</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[s.ipAddress, `active ${timeAgo(s.updatedAt)}`, `signed in ${timeAgo(s.createdAt)}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              {!isCurrent && (
                <Button variant="ghost" size="sm" disabled={busy === s.id} onClick={() => void revoke(s)}>
                  {busy === s.id && <Loader2 className="animate-spin" />} Sign out
                </Button>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

/** "Chrome on Windows" from a user-agent string (good enough to recognise your own devices). */
function describeAgent(ua: string | null | undefined) {
  if (!ua) return { label: 'Unknown device', mobile: false }
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /chrome|crios/i.test(ua)
          ? 'Chrome'
          : /safari/i.test(ua)
            ? 'Safari'
            : 'Browser'
  const os = /iphone|ipad|ipod/i.test(ua)
    ? 'iOS'
    : /android/i.test(ua)
      ? 'Android'
      : /windows/i.test(ua)
        ? 'Windows'
        : /mac os x|macintosh/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : null
  return { label: os ? `${browser} on ${os}` : browser, mobile: /mobile|iphone|android/i.test(ua) }
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
function timeAgo(d: Date | string) {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return rtf.format(-mins, 'minute')
  const hours = Math.round(mins / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.round(hours / 24), 'day')
}

// ---------------------------------------------------------------- delete account

function DeleteAccountCard() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently delete your account and everything in it: linked banks, saved bank sign-ins, accounts,
          transactions, categories and subscriptions. This can’t be undone.
        </CardDescription>
        <CardAction>
          <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
            <Trash2 /> Delete account
          </Button>
        </CardAction>
      </CardHeader>
      <PasswordDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete your account and data?"
        description="All of your data is removed from this server immediately. Type DELETE and your password to confirm."
        confirmWord="DELETE"
        action="Delete everything"
        destructive
        run={async (password) => {
          const { error } = await authClient.deleteUser({ password })
          if (error) return error.message ?? 'Could not delete your account'
          queryClient.clear()
          toast.success('Your account and data were deleted')
          navigate('/login', { replace: true })
          return null
        }}
      />
    </Card>
  )
}

// ---------------------------------------------------------------- shared

function PasswordDialog({
  open,
  onClose,
  title,
  description,
  action,
  destructive,
  confirmWord,
  keepOpen,
  run,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  action: string
  destructive?: boolean
  /** Also make the user type this word (for irreversible actions). */
  confirmWord?: string
  /** Leave the dialog open on success (the caller shows a follow-up step). */
  keepOpen?: boolean
  /** Returns an error message, or null on success. */
  run: (password: string) => Promise<string | null>
}) {
  const [password, setPassword] = useState('')
  const [word, setWord] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    onClose()
    setPassword('')
    setWord('')
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await run(password)
    setBusy(false)
    setPassword('')
    if (err) setError(err)
    else if (!keepOpen) close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {confirmWord && (
            <div className="grid gap-2">
              <Label htmlFor="confirm-word">Type {confirmWord} to confirm</Label>
              <Input id="confirm-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" required />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="confirm-password">Password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={!confirmWord}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={busy || !password || (!!confirmWord && word !== confirmWord)}
            >
              {busy && <Loader2 className="animate-spin" />} {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
