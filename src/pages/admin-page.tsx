import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  CirclePlay,
  ListChecks,
  Crown,
  Dices,
  History,
  KeyRound,
  Loader2,
  LogOut,
  MonitorPlay,
  MoreHorizontal,
  ShieldCheck,
  ShieldMinus,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isStrongPassword, PASSWORD_MAX, PasswordRules } from '@/components/password-rules'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { authClient, useSession } from '@/lib/auth-client'
import { setDemoMode } from '@/lib/demo'
import { formatRelative, formatTimestamp } from '@/lib/format'
import { queryClient } from '@/lib/queries'
import { cn } from '@/lib/utils'

/** The server's built-in demo user; it holds the sample data, not a real account. */
const DEMO_EMAIL = 'demo@ledger.invalid'

interface AdminUser {
  id: string
  name: string
  email: string
  role?: string | null
  banned?: boolean | null
  twoFactorEnabled?: boolean | null
  mustChangePassword?: boolean | null
  createdAt: Date | string
}

const usersKey = ['admin', 'users'] as const
const settingsKey = ['admin', 'settings'] as const
const auditKey = ['admin', 'audit'] as const

interface AdminSettings {
  registrationOpen: boolean
  /** The account that set this Ledger up: only it can manage admins or its own account. */
  ownerId: string | null
}

const tasksKey = ['admin', 'tasks'] as const

interface AuditEntry {
  id: string
  at: string
  kind: 'admin' | 'auth'
  ip: string | null
  actorEmail: string | null
  action: string
  targetEmail: string | null
  detail: string | null
}

export function AdminPage() {
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">People who can use this Ledger, and who may sign up.</p>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <SignupsCard />
        <DemoCard />
      </div>
      <UsersCard />
      <TasksCard />
      <ActivityCard />
    </div>
  )
}

// ---------------------------------------------------------------- instance settings

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed')
  return data as T
}

const useAdminSettings = () => useQuery({ queryKey: settingsKey, queryFn: () => adminFetch<AdminSettings>('settings') })

function SignupsCard() {
  const settings = useAdminSettings()
  const [saving, setSaving] = useState(false)
  const open = settings.data?.registrationOpen ?? false

  async function toggle(next: boolean) {
    setSaving(true)
    try {
      await adminFetch('settings', { method: 'PUT', body: JSON.stringify({ registrationOpen: next }) })
      await settings.refetch()
      void queryClient.invalidateQueries({ queryKey: auditKey })
      toast.success(next ? 'Anyone can now create an account' : 'Sign-ups closed')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Sign-ups
          {settings.data && (open ? <Badge>Open</Badge> : <Badge variant="secondary">Closed</Badge>)}
        </CardTitle>
        <CardDescription>
          Let anyone with the link create their own account. You can still add people yourself when this is off.
        </CardDescription>
        <CardAction>
          {settings.isPending ? (
            <Skeleton className="h-5 w-9 rounded-full" />
          ) : (
            <Switch
              checked={open}
              disabled={saving || !!settings.error}
              onCheckedChange={(v) => void toggle(v)}
              aria-label="Allow sign-ups"
            />
          )}
        </CardAction>
      </CardHeader>
      {settings.error && (
        <CardContent>
          <p className="text-sm text-destructive">{settings.error.message}</p>
        </CardContent>
      )}
    </Card>
  )
}

function DemoCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo mode</CardTitle>
        <CardDescription>
          Browse the whole app filled with made-up accounts and transactions, handy for showing it off without your real
          balances on screen.
        </CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setDemoMode(true)}>
            <MonitorPlay /> Start demo
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}

// ---------------------------------------------------------------- users

function initials(u: { name?: string; email?: string }) {
  return (u.name || u.email || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const joined = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

type UserDialog =
  | { type: 'add' }
  | { type: 'password'; user: AdminUser }
  | { type: 'role'; user: AdminUser }
  | { type: 'delete'; user: AdminUser }
  | { type: 'ban'; user: AdminUser }

function UsersCard() {
  const { data: session } = useSession()
  const settings = useAdminSettings()
  const ownerId = settings.data?.ownerId ?? null
  const iAmOwner = !!session && session.user.id === ownerId
  const users = useQuery({
    queryKey: usersKey,
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({
        query: { limit: 500, sortBy: 'createdAt', sortDirection: 'asc' },
      })
      if (error) throw new Error(error.message ?? 'Could not load users')
      return (data.users as AdminUser[]).filter((u) => u.email !== DEMO_EMAIL)
    },
  })
  const [dialog, setDialog] = useState<UserDialog | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(user: AdminUser, label: string, run: () => Promise<{ error: { message?: string } | null }>) {
    setBusy(user.id)
    const { error } = await run()
    setBusy(null)
    if (error) toast.error(error.message ?? 'Something went wrong')
    else toast.success(label)
    refresh()
  }

  function refresh() {
    void users.refetch()
    void queryClient.invalidateQueries({ queryKey: auditKey })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Users
          {users.data && <Badge variant="secondary">{users.data.length}</Badge>}
        </CardTitle>
        <CardDescription>
          Each person sees only their own banks and data. Admins can also open this page; only the owner can choose who’s an
          admin.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setDialog({ type: 'add' })}>
            <UserPlus /> Add user
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-1">
        {users.isPending &&
          [0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="size-8 rounded-full" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        {users.error && <p className="text-sm text-destructive">{users.error.message}</p>}
        {users.data?.map((u, i) => {
          const isMe = u.id === session?.user.id
          const isAdmin = u.role === 'admin'
          const isOwner = u.id === ownerId
          // Nobody else can manage the owner's account.
          const manageable = !isMe && (!isOwner || iAmOwner)
          return (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 animate-in fade-in-0 duration-300 fill-mode-both"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials(u)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{u.name || u.email}</span>
                  {isMe && <Badge variant="outline">You</Badge>}
                  {isOwner ? (
                    <Badge>
                      <Crown /> Owner
                    </Badge>
                  ) : (
                    isAdmin && <Badge>Admin</Badge>
                  )}
                  {u.mustChangePassword && <Badge variant="outline">Temporary password</Badge>}
                  {u.banned && <Badge variant="destructive">Banned</Badge>}
                  {u.twoFactorEnabled && (
                    <Badge variant="secondary">
                      <ShieldCheck /> 2FA
                    </Badge>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email} · joined {joined.format(new Date(u.createdAt))}
                </div>
              </div>
              {busy === u.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              {manageable && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon" aria-label={`Manage ${u.name || u.email}`} disabled={busy === u.id} />}
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {iAmOwner && (
                      <DropdownMenuItem onClick={() => setDialog({ type: 'role', user: u })}>
                        {isAdmin ? <ShieldMinus /> : <ShieldCheck />} {isAdmin ? 'Remove admin' : 'Make admin'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setDialog({ type: 'password', user: u })}>
                      <KeyRound /> Set temporary password
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void act(u, 'Signed out everywhere', () => authClient.admin.revokeUserSessions({ userId: u.id }))
                      }
                    >
                      <LogOut /> Sign out everywhere
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {u.banned ? (
                      <DropdownMenuItem onClick={() => void act(u, 'Access restored', () => authClient.admin.unbanUser({ userId: u.id }))}>
                        <UserCheck /> Restore access
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => setDialog({ type: 'ban', user: u })}>
                        <Ban /> Block sign-in
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem variant="destructive" onClick={() => setDialog({ type: 'delete', user: u })}>
                      <Trash2 /> Delete user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })}
      </CardContent>

      <AddUserDialog open={dialog?.type === 'add'} canAddAdmins={iAmOwner} onClose={() => setDialog(null)} onAdded={refresh} />
      <SetPasswordDialog user={dialog?.type === 'password' ? dialog.user : null} onClose={() => setDialog(null)} onDone={refresh} />
      <ConfirmDialog
        user={dialog?.type === 'role' ? dialog.user : null}
        onClose={() => setDialog(null)}
        destructive={dialog?.type === 'role' && dialog.user.role === 'admin'}
        title={dialog?.type === 'role' && dialog.user.role === 'admin' ? 'Remove their admin access?' : 'Make this person an admin?'}
        description={(u) =>
          u.role === 'admin'
            ? `${u.name || u.email} goes back to a regular account and loses access to this page.`
            : `${u.name || u.email} will be able to add, block and delete users, set temporary passwords, and open or close sign-ups. They can’t touch your account or change who’s an admin.`
        }
        action={dialog?.type === 'role' && dialog.user.role === 'admin' ? 'Remove admin' : 'Make admin'}
        run={async (u) => {
          const admin = u.role === 'admin'
          const { error } = await authClient.admin.setRole({ userId: u.id, role: admin ? 'user' : 'admin' })
          if (error) return error.message ?? 'Could not change their role'
          toast.success(admin ? 'No longer an admin' : 'Now an admin')
          refresh()
          return null
        }}
      />
      <ConfirmDialog
        user={dialog?.type === 'ban' ? dialog.user : null}
        onClose={() => setDialog(null)}
        title="Block this person from signing in?"
        description={(u) =>
          `${u.name || u.email} is signed out everywhere and can’t sign in until you restore access. Their data is kept.`
        }
        action="Block sign-in"
        run={async (u) => {
          const { error } = await authClient.admin.banUser({ userId: u.id })
          if (error) return error.message ?? 'Could not block this user'
          toast.success('Sign-in blocked')
          refresh()
          return null
        }}
      />
      <ConfirmDialog
        user={dialog?.type === 'delete' ? dialog.user : null}
        onClose={() => setDialog(null)}
        title="Delete this user and their data?"
        description={(u) =>
          `${u.name || u.email}’s account, linked banks, saved bank sign-ins, transactions, subscriptions, goals and work hours are removed for good. This can’t be undone.`
        }
        action="Delete user"
        confirmText={(u) => u.email}
        run={async (u) => {
          const { error } = await authClient.admin.removeUser({ userId: u.id })
          if (error) return error.message ?? 'Could not delete this user'
          toast.success('User deleted')
          refresh()
          return null
        }}
      />
    </Card>
  )
}

/**
 * 14 easy-to-read characters (no 0/O or 1/l/I), for passwords you'll read out or paste to someone.
 * Drawn until it meets the password rules (a symbol and a digit usually turn up in a draw or two).
 */
function randomPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#$%&*+-=?@'
  for (;;) {
    // Bytes past the last whole multiple of the alphabet's length are dropped, so every character is equally likely.
    const bytes = Array.from(crypto.getRandomValues(new Uint8Array(32))).filter((b) => b < 256 - (256 % alphabet.length))
    const pw = bytes.slice(0, 14).map((b) => alphabet[b % alphabet.length]).join('')
    if (pw.length === 14 && isStrongPassword(pw)) return pw
  }
}

/** A visible password field with a generator: it's temporary, and you'll need to pass it on. */
function TemporaryPasswordField({
  id,
  value,
  onChange,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Temporary password</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          maxLength={PASSWORD_MAX}
          aria-describedby={`${id}-rules`}
          autoFocus={autoFocus}
          required
        />
        <Button type="button" variant="outline" onClick={() => onChange(randomPassword())}>
          <Dices /> Generate
        </Button>
      </div>
      <PasswordRules id={`${id}-rules`} password={value} />
      <p className="text-xs text-muted-foreground">
        They have to choose their own password the next time they sign in, and this one stops working then.
      </p>
    </div>
  )
}

async function copyPassword(password: string) {
  try {
    await navigator.clipboard.writeText(password)
    return true
  } catch {
    return false
  }
}

function AddUserDialog({
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    onClose()
    setName('')
    setEmail('')
    setPassword('')
    setMakeAdmin(false)
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await authClient.admin.createUser({
      name: name.trim(),
      email: email.trim(),
      password,
      role: makeAdmin && canAddAdmins ? 'admin' : 'user',
    })
    setBusy(false)
    if (error) return setError(error.message ?? 'Could not add this user')
    const copied = await copyPassword(password)
    toast.success(`Added ${name.trim() || email.trim()}`, {
      description: copied ? 'Temporary password copied. Send it to them privately.' : 'Send them the temporary password privately.',
    })
    onAdded()
    close()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Works even while sign-ups are closed. Give them the temporary password; they choose their own the first time they sign
            in.
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
            <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus required />
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
          <TemporaryPasswordField id="new-user-password" value={password} onChange={setPassword} />
          {canAddAdmins && (
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={makeAdmin} onCheckedChange={(v) => setMakeAdmin(v === true)} />
              Make them an admin too
            </Label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !email.trim() || !isStrongPassword(password)}>
              {busy && <Loader2 className="animate-spin" />} Add user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SetPasswordDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function close() {
    onClose()
    setPassword('')
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setError(null)
    // The server also signs them out everywhere and makes them pick a new password at next sign-in.
    const { error } = await authClient.admin.setUserPassword({ userId: user.id, newPassword: password })
    setBusy(false)
    if (error) return setError(error.message ?? 'Could not set the password')
    const copied = await copyPassword(password)
    toast.success('Temporary password set', {
      description: copied ? 'Copied to your clipboard. Send it to them privately.' : 'Send it to them privately.',
    })
    onDone()
    close()
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set a temporary password</DialogTitle>
          <DialogDescription>
            For {user?.name || user?.email}, if they’re locked out. They’re signed out on every device, sign in once with this
            password, and then have to choose a new one that only they know.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <TemporaryPasswordField id="set-password" value={password} onChange={setPassword} autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !isStrongPassword(password)}>
              {busy && <Loader2 className="animate-spin" />} Set temporary password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDialog({
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
  const [typed, setTyped] = useState('')
  const expected = user && confirmText ? confirmText(user) : null
  const confirmed = expected === null || typed.trim().toLowerCase() === expected.toLowerCase()

  function close() {
    onClose()
    setError(null)
    setTyped('')
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
                Type <span className="font-mono font-medium">{expected}</span> to confirm
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
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy || !confirmed}
            onClick={async () => {
              if (!user) return
              setBusy(true)
              const err = await run(user)
              setBusy(false)
              if (err) setError(err)
              else close()
            }}
          >
            {busy && <Loader2 className="animate-spin" />} {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- audit log

interface TaskInfo {
  id: string
  label: string
  description: string
  intervalMs: number
  running: boolean
  nextRunAt: string | null
  lastRun: {
    startedAt: string
    finishedAt: string | null
    durationMs: number | null
    status: 'running' | 'ok' | 'error'
    summary: string | null
    trigger: 'schedule' | 'manual'
  } | null
}

const every = (ms: number) => {
  const h = ms / 3_600_000
  return h >= 24 && h % 24 === 0 ? (h === 24 ? 'Daily' : `Every ${h / 24} days`) : `Every ${h} hours`
}
const took = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`)

function TasksCard() {
  const tasks = useQuery({
    queryKey: tasksKey,
    queryFn: () => adminFetch<{ tasks: TaskInfo[] }>('tasks'),
    // Keep checking while something runs, so the result shows up when it's done.
    refetchInterval: (q) => (q.state.data?.tasks.some((t) => t.running) ? 3000 : 60_000),
  })
  const [starting, setStarting] = useState<string | null>(null)

  async function run(t: TaskInfo) {
    setStarting(t.id)
    try {
      const data = await adminFetch<{ tasks: TaskInfo[] }>(`tasks/${t.id}/run`, { method: 'POST' })
      queryClient.setQueryData(tasksKey, data)
      void queryClient.invalidateQueries({ queryKey: auditKey })
      toast.success(`${t.label} started`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setStarting(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" /> Tasks
        </CardTitle>
        <CardDescription>Jobs that run in the background on their own. Run one now if you don’t want to wait.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {tasks.isPending && <Skeleton className="h-16 w-full" />}
        {tasks.error && <p className="text-sm text-destructive">{tasks.error.message}</p>}
        {tasks.data?.tasks.map((t) => {
          const last = t.lastRun
          return (
            <div key={t.id} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.label}</span>
                  <Badge variant="secondary">{every(t.intervalMs)}</Badge>
                  {t.running ? (
                    <Badge variant="outline" className="gap-1">
                      <Loader2 className="size-3 animate-spin" /> Running
                    </Badge>
                  ) : last?.status === 'error' ? (
                    <Badge variant="destructive">Failed</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {last ? (
                    <>
                      Last run{' '}
                      <span className="text-foreground" title={formatTimestamp(last.startedAt)}>
                        {formatRelative(last.startedAt)}
                      </span>
                      {last.trigger === 'manual' && ' (run by hand)'}
                      {last.durationMs !== null && ` · took ${took(last.durationMs)}`}
                      {last.summary && ` · ${last.summary}`}
                    </>
                  ) : (
                    'Hasn’t run yet'
                  )}
                  {!t.running && t.nextRunAt && <> · next {formatRelative(t.nextRunAt)}</>}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={t.running || starting === t.id} onClick={() => void run(t)}>
                {starting === t.id ? <Loader2 className="animate-spin" /> : <CirclePlay />} Run now
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

type AuditFilter = 'all' | 'admin' | 'auth'

function ActivityCard() {
  const [filter, setFilter] = useState<AuditFilter>('all')
  const [showAll, setShowAll] = useState(false)
  const audit = useQuery({
    queryKey: [...auditKey, filter],
    queryFn: () => adminFetch<{ entries: AuditEntry[] }>(filter === 'all' ? 'audit' : `audit?kind=${filter}`),
  })
  const entries = audit.data?.entries ?? []
  const shown = showAll ? entries : entries.slice(0, 25)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" /> Audit log
        </CardTitle>
        <CardDescription>Admin changes, sign-ins and sign-outs (failed attempts too), with who did it and from where.</CardDescription>
        <CardAction>
          <ToggleGroup value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as AuditFilter)} variant="outline" size="sm">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
            <ToggleGroupItem value="auth">Sign-ins</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {audit.isPending && <Skeleton className="h-16 w-full" />}
        {audit.error && <p className="text-sm text-destructive">{audit.error.message}</p>}
        {audit.data && entries.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        {entries.length > 0 && (
          <ul className="grid gap-0.5 text-sm">
            {shown.map((e) => {
              const failed = e.action.endsWith('(failed)')
              return (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                  <span className={cn('font-medium', failed && 'text-destructive')}>{e.action}</span>
                  {e.targetEmail && <span className="min-w-0 truncate">{e.targetEmail}</span>}
                  {e.detail && <span className="text-muted-foreground">{e.detail}</span>}
                  <span className="ml-auto text-xs text-muted-foreground" title={formatTimestamp(e.at)}>
                    {e.actorEmail ?? 'unknown'}
                    {e.ip && ` · ${e.ip}`} · {formatRelative(e.at)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {entries.length > 25 && (
          <button type="button" className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show all ${entries.length}`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
