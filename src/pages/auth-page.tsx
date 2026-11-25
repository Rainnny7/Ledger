import { Loader2 } from "lucide-react"
import { Brand } from "@/components/layout/brand"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  isStrongPassword,
  PASSWORD_MAX,
  PasswordRules,
} from "@/components/common/password-rules"
import { signIn, signUp, twoFactor } from "@/lib/auth-client"
import { detectCurrency } from "@/lib/currency"
import { usePageTitle } from "@/lib/page-title"
import { useAppConfig } from "@/lib/queries"

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // Password accepted, but the account has 2FA: ask for an authenticator (or backup) code.
  const [needsCode, setNeedsCode] = useState(false)
  const [code, setCode] = useState("")
  const [useBackup, setUseBackup] = useState(false)
  const [trustDevice, setTrustDevice] = useState(false)
  const isRegister = mode === "register"
  const config = useAppConfig()
  const closed = isRegister && config?.registrationOpen === false
  usePageTitle(
    needsCode ? "Two-factor sign-in" : isRegister ? "Create account" : "Sign in"
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      if (needsCode) {
        const { error } = useBackup
          ? await twoFactor.verifyBackupCode({ code: code.trim(), trustDevice })
          : await twoFactor.verifyTotp({
              code: code.replace(/\s/g, ""),
              trustDevice,
            })
        if (error) setError(error.message ?? "That code didn’t work")
        else navigate("/", { replace: true })
        return
      }
      const { data, error } = isRegister
        ? await signUp.email({
            name,
            email,
            password,
            currency: detectCurrency(),
          })
        : await signIn.email({ email, password })
      if (error) setError(error.message ?? "Something went wrong")
      else if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
        setNeedsCode(true)
        setCode("")
      } else navigate("/", { replace: true })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-muted/40 p-4">
      {/* Soft sunset glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-sunset opacity-10 blur-3xl dark:opacity-[0.08]"
      />
      <Brand className="relative text-lg" />
      <Card className="relative w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {needsCode
              ? "Two-factor authentication"
              : isRegister
                ? "Create your account"
                : "Welcome back"}
          </CardTitle>
          <CardDescription>
            {needsCode
              ? useBackup
                ? "Enter one of the backup codes you saved when you turned on 2FA."
                : "Enter the 6-digit code from your authenticator app."
              : isRegister
                ? "Sign up to start tracking your bank accounts."
                : "Sign in to see your balances and transactions."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="grid gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {needsCode && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="code">
                    {useBackup ? "Backup code" : "Code"}
                  </Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode={useBackup ? "text" : "numeric"}
                    autoFocus
                    required
                  />
                </div>
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={trustDevice}
                    onCheckedChange={(v) => setTrustDevice(v === true)}
                  />
                  Trust this device for 30 days
                </Label>
                <button
                  type="button"
                  className="justify-self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  onClick={() => {
                    setUseBackup((b) => !b)
                    setCode("")
                    setError(null)
                  }}
                >
                  {useBackup
                    ? "Use your authenticator app instead"
                    : "Lost your phone? Use a backup code"}
                </button>
              </>
            )}
            {!needsCode && isRegister && (
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}
            {!needsCode && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      isRegister ? "new-password" : "current-password"
                    }
                    maxLength={PASSWORD_MAX}
                    aria-describedby={isRegister ? "password-rules" : undefined}
                    required
                  />
                  {isRegister && (
                    <PasswordRules
                      id="password-rules"
                      password={password}
                      className="sm:grid-cols-1"
                    />
                  )}
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3">
            {closed && (
              <Alert>
                <AlertDescription>
                  Sign-ups are closed on this server. Ask its admin to add you,
                  or sign in if you already have an account.
                </AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={
                pending ||
                closed ||
                (isRegister && !needsCode && !isStrongPassword(password))
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              {needsCode ? "Verify" : isRegister ? "Create account" : "Sign in"}
            </Button>
            {needsCode && (
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => {
                  setNeedsCode(false)
                  setPassword("")
                  setError(null)
                }}
              >
                Back to sign in
              </button>
            )}
            {!needsCode && (isRegister || config?.registrationOpen) && (
              <p className="text-sm text-muted-foreground">
                {isRegister ? "Already have an account? " : "New here? "}
                <Link
                  to={isRegister ? "/login" : "/register"}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {isRegister ? "Sign in" : "Create one"}
                </Link>
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
