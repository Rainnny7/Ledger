import { KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Brand } from '@/components/brand'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient, signOut, useSession } from '@/lib/auth-client'
import { usePageTitle } from '@/lib/page-title'
import { isStrongPassword, PASSWORD_MAX, PasswordRules } from '@/components/password-rules'

/**
 * Shown instead of the app while the account is on a temporary password an admin set. The person
 * replaces it with one only they know, which also signs out every other device, so whoever handed
 * the temporary password out can't keep using it.
 */
export function ChangeTemporaryPasswordPage() {
  const { data, refetch } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  usePageTitle('Choose a password')

  const mismatch = confirm.length > 0 && next !== confirm
  const sameAsOld = next.length > 0 && next === current
  const valid = current.length > 0 && isStrongPassword(next) && next === confirm && !sameAsOld

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true })
    if (error) {
      setBusy(false)
      setError(error.code === 'INVALID_PASSWORD' ? 'That temporary password is wrong.' : (error.message ?? 'Could not change your password'))
      return
    }
    await refetch()
    toast.success('Password changed. Welcome to Ledger!')
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-muted/40 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-sunset opacity-10 blur-3xl dark:opacity-[0.08]"
      />
      <Brand className="relative text-lg" />
      <Card className="relative w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-sunset text-white">
            <KeyRound className="size-5" />
          </div>
          <CardTitle>Choose your own password</CardTitle>
          <CardDescription>
            {data?.user.email ? <span className="font-medium text-foreground">{data.user.email}</span> : 'Your account'} is signed in with a
            temporary password from an admin. Replace it with one only you know to continue.
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit}>
          <CardContent className="grid gap-4">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in-0 duration-200">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="temp-password">Temporary password</Label>
              <Input
                id="temp-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoFocus
              />
            </div>
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
                <p className="text-xs text-destructive">Pick something different from the temporary password.</p>
              ) : (
                <PasswordRules id="new-password-rules" password={next} className="sm:grid-cols-1" />
              )}
            </div>
            <div className="grid gap-2">
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
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-2">
            <Button type="submit" className="w-full" disabled={!valid || busy}>
              {busy && <Loader2 className="animate-spin" />}
              Set password and continue
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
