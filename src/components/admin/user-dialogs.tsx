import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isStrongPassword } from "@/components/common/password-rules"
import type { AdminUser } from "@/components/admin/admin-types"
import { copyPassword } from "@/components/admin/admin-user-utils"
import { TemporaryPasswordField } from "@/components/admin/temporary-password-field"
import { authClient } from "@/lib/auth-client"

export function AddUserDialog({
  open,
  canAddAdmins,
  onClose,
  onAdded,
}: {
  open: boolean
  canAddAdmins: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    onClose()
    setName("")
    setEmail("")
    setPassword("")
    setMakeAdmin(false)
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error } = await authClient.admin.createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role: makeAdmin && canAddAdmins ? "admin" : "user",
      })
      if (error) return setError(error.message ?? "Could not add this user")
      const copied = await copyPassword(password)
      toast.success(`Added ${name.trim() || email.trim()}`, {
        description: copied
          ? "Temporary password copied. Send it to them privately."
          : "Send them the temporary password privately.",
      })
      onAdded()
      close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Works even while sign-ups are closed. Give them the temporary
            password; they choose their own the first time they sign in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="new-user-name">Name</Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              autoFocus
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <TemporaryPasswordField
            id="new-user-password"
            value={password}
            onChange={setPassword}
          />
          {canAddAdmins && (
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={makeAdmin}
                onCheckedChange={(v) => setMakeAdmin(v === true)}
              />
              Make them an admin too
            </Label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                !name.trim() ||
                !email.trim() ||
                !isStrongPassword(password)
              }
            >
              {busy && <Loader2 className="animate-spin" />} Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SetPasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser | null
  onClose: () => void
  onDone: () => void
}) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    onClose()
    setPassword("")
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    // The server also signs them out everywhere and makes them pick a new password at next sign-in.
    try {
      const { error } = await authClient.admin.setUserPassword({
        userId: user.id,
        newPassword: password,
      })
      if (error) return setError(error.message ?? "Could not set the password")
      const copied = await copyPassword(password)
      toast.success("Temporary password set", {
        description: copied
          ? "Copied to your clipboard. Send it to them privately."
          : "Send it to them privately.",
      })
      onDone()
      close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set a temporary password</DialogTitle>
          <DialogDescription>
            For {user?.name || user?.email}, if they’re locked out. They’re
            signed out on every device, sign in once with this password, and
            then have to choose a new one that only they know.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <TemporaryPasswordField
            id="set-password"
            value={password}
            onChange={setPassword}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !isStrongPassword(password)}
            >
              {busy && <Loader2 className="animate-spin" />} Set temporary
              password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AdminUserConfirmDialog({
  user,
  onClose,
  title,
  description,
  action,
  run,
  destructive = true,
  confirmText,
}: {
  user: AdminUser | null
  onClose: () => void
  title: string
  description: (u: AdminUser) => string
  action: string
  /** Returns an error message, or null on success. */
  run: (u: AdminUser) => Promise<string | null>
  destructive?: boolean
  /** When set, the button stays disabled until this exact text is typed in. */
  confirmText?: (u: AdminUser) => string
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState("")
  const expected = user && confirmText ? confirmText(user) : null
  const confirmed =
    expected === null || typed.trim().toLowerCase() === expected.toLowerCase()

  function close() {
    onClose()
    setError(null)
    setTyped("")
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{user && description(user)}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {expected !== null && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-text" className="font-normal">
              <span>
                Type <span className="font-mono font-medium">{expected}</span>{" "}
                to confirm
              </span>
            </Label>
            <Input
              id="confirm-text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy || !confirmed}
            onClick={async () => {
              if (!user) return
              setBusy(true)
              try {
                const err = await run(user)
                if (err) setError(err)
                else close()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
