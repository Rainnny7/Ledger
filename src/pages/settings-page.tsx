import { Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isStrongPassword, PASSWORD_MAX, PasswordRules } from '@/components/password-rules'
import { Switch } from '@/components/ui/switch'
import { CurrencySelect } from '@/components/currency-select'
import { authClient, useSession } from '@/lib/auth-client'
import { currencyName, useFx, useHomeCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { queryClient } from '@/lib/queries'
import { demoMode, setDemoPrefs, useDemoPrefs } from '@/lib/demo'
import { DevicesCard } from '@/components/settings/devices-card'
import { PasswordDialog } from '@/components/settings/password-dialog'
import { TwoFactorCard } from '@/components/settings/two-factor-card'

export function SettingsPage() {
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Preferences, security and your account.</p>
      </div>
      {demoMode && (
        <Alert>
          <AlertDescription>
            Demo mode: preferences changed here only last until you exit demo mode. Everything else is turned off.
          </AlertDescription>
        </Alert>
      )}
      <PreferencesCard />
      {demoMode ? (
        // Shown for the tour, but inert: these act on the real account.
        <div inert aria-disabled className="grid gap-8 opacity-50 select-none">
          <ChangePasswordCard />
          <TwoFactorCard />
          <DeleteAccountCard />
        </div>
      ) : (
        <>
          <ChangePasswordCard />
          <TwoFactorCard />
          <DevicesCard />
          <DeleteAccountCard />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- preferences

function PreferencesCard() {
  const { data } = useSession()
  const demo = useDemoPrefs()
  const saved = demo.includeOverdraft ?? (data?.user as { includeOverdraft?: boolean | null } | undefined)?.includeOverdraft ?? true
  // Shown straight away; the session catches up once the server has it.
  const [pending, setPending] = useState<boolean | null>(null)
  const checked = pending ?? saved

  async function toggle(value: boolean) {
    if (demoMode) return setDemoPrefs({ includeOverdraft: value })
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
    if (demoMode) {
      setDemoPrefs({ currency: code })
      toast.success(`Totals now show in ${currencyName(code)}`)
      return
    }
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

