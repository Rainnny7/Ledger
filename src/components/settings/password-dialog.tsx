import { Loader2 } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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

/** Asks for the account password before a sensitive change. */

export function PasswordDialog({
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
  const [password, setPassword] = useState("")
  const [word, setWord] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    onClose()
    setPassword("")
    setWord("")
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const err = await run(password)
      if (err) setError(err)
      else if (!keepOpen) close()
    } finally {
      setBusy(false)
      setPassword("")
    }
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
              <Label htmlFor="confirm-word">
                Type {confirmWord} to confirm
              </Label>
              <Input
                id="confirm-word"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                autoComplete="off"
                required
              />
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
              variant={destructive ? "destructive" : "default"}
              disabled={
                busy || !password || (!!confirmWord && word !== confirmWord)
              }
            >
              {busy && <Loader2 className="animate-spin" />} {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
