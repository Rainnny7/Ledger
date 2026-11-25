import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  isStrongPassword,
  PASSWORD_MAX,
  PasswordRules,
} from "@/components/common/password-rules"
import { authClient } from "@/lib/auth-client"
import { queryClient } from "@/lib/queries"

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const sameAsOld = next.length > 0 && next === current
  const valid =
    current.length > 0 &&
    isStrongPassword(next) &&
    next === confirm &&
    !sameAsOld

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: signOutOthers,
      })
      if (error) {
        setError(
          error.code === "INVALID_PASSWORD"
            ? "Your current password is wrong."
            : (error.message ?? "Could not change your password")
        )
        return
      }
      setCurrent("")
      setNext("")
      setConfirm("")
      toast.success(
        signOutOthers
          ? "Password changed. Other devices were signed out."
          : "Password changed"
      )
      void queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Change the password you sign in to Ledger with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          {error && (
            <Alert
              variant="destructive"
              className="animate-in duration-200 fade-in-0"
            >
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
                <p className="text-xs text-destructive">
                  Pick something different from your current password.
                </p>
              ) : (
                <PasswordRules
                  id="new-password-rules"
                  password={next}
                  className="sm:grid-cols-1"
                />
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
              {mismatch && (
                <p className="animate-in text-xs text-destructive duration-200 fade-in-0">
                  Passwords don’t match.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={signOutOthers}
                onCheckedChange={(v) => setSignOutOthers(v === true)}
              />
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
