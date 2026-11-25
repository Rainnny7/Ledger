import { useQuery } from '@tanstack/react-query'
import { Eye, Loader2, Pencil, UserPlus, Users, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, type Shared, type ShareKind, type SharePermission } from '@/lib/api'
import { demoMode } from '@/lib/demo'
import { useContacts } from '@/lib/queries'
import { initials, KIND_LABEL, shortName } from '@/lib/sharing'
import { cn } from '@/lib/utils'

const PERMISSION_ITEMS = [
  { value: 'view', label: 'Can view' },
  { value: 'edit', label: 'Can edit' },
]

function PermissionSelect({
  value,
  onChange,
  size = 'sm',
}: {
  value: SharePermission
  onChange: (p: SharePermission) => void
  size?: 'sm' | 'default'
}) {
  return (
    <Select items={PERMISSION_ITEMS} value={value} onValueChange={(v) => v && onChange(v as SharePermission)}>
      <SelectTrigger size={size} className="w-28" aria-label="Permission">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERMISSION_ITEMS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Email field that suggests your contacts as you type. */
export function ContactPicker({
  value,
  onChange,
  exclude = [],
  id,
}: {
  value: string
  onChange: (email: string) => void
  exclude?: string[]
  id?: string
}) {
  const contacts = useContacts().data?.contacts ?? []
  const [focused, setFocused] = useState(false)
  const q = value.trim().toLowerCase()
  const matches = contacts
    .filter((c) => !exclude.includes(c.email) && c.email !== q)
    .filter((c) => !q || c.email.includes(q) || c.name?.toLowerCase().includes(q))
    .slice(0, 6)
  return (
    <div className="relative">
      <Input
        id={id}
        type="email"
        autoComplete="off"
        placeholder="name@example.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        // Leave time for a click on a suggestion to land.
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        role="combobox"
        aria-expanded={focused && matches.length > 0}
        aria-autocomplete="list"
      />
      {focused && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {matches.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.email)
                  setFocused(false)
                }}
              >
                <ContactAvatar contact={c} />
                <span className="min-w-0 flex-1">
                  {c.name && <span className="block truncate font-medium">{c.name}</span>}
                  <span className={cn('block truncate', c.name && 'text-xs text-muted-foreground')}>{c.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ContactAvatar({ contact, className }: { contact: { name?: string | null; email: string }; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary', className)}
    >
      {initials(contact)}
    </span>
  )
}

/** Share one goal, subscription or job: who has it, and add someone by email or from your contacts. */
export function ShareDialog({
  kind,
  item,
  onClose,
}: {
  kind: ShareKind
  item: { id: string; name: string } | null
  onClose: () => void
}) {
  const shares = useQuery({
    queryKey: ['shares', kind, item?.id],
    queryFn: () => api.shares(kind, item!.id),
    enabled: !!item,
  })
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<SharePermission>('view')
  const [saving, setSaving] = useState(false)
  const list = shares.data?.shares ?? []

  const close = () => {
    setEmail('')
    setPermission('view')
    onClose()
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!item || !email.trim()) return
    setSaving(true)
    try {
      await api.share(kind, item.id, { email: email.trim(), permission })
      toast.success(`Shared ${item.name}`, { description: `${email.trim()} will see it in their ${KIND_LABEL[kind]}s.` })
      setEmail('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function change(id: string, p: SharePermission) {
    try {
      await api.updateShare(id, p)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function remove(id: string, who: string) {
    try {
      await api.unshare(id)
      toast.success(`Stopped sharing with ${who}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share {item?.name}</DialogTitle>
          <DialogDescription>
            People you share with see this {KIND_LABEL[kind]} in their own Ledger. Only you can delete it or change who it’s shared with.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="grid gap-2">
          <Label htmlFor="share-email">Add someone</Label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <ContactPicker id="share-email" value={email} onChange={setEmail} exclude={list.map((s) => s.email)} />
            </div>
            <PermissionSelect value={permission} onChange={setPermission} size="default" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Link to="/contacts" className="text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={close}>
              Manage contacts
            </Link>
            <Button type="submit" size="sm" disabled={saving || !email.trim() || demoMode}>
              {saving ? <Loader2 className="animate-spin" /> : <UserPlus />} Share
            </Button>
          </div>
        </form>

        <div className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">People with access</h3>
          {shares.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Just you, for now.</p>
          ) : (
            <ul className="grid gap-1">
              {list.map((s) => (
                <li key={s.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                  <ContactAvatar contact={s} />
                  <span className="min-w-0 flex-1">
                    {s.name && <span className="block truncate text-sm font-medium">{s.name}</span>}
                    <span className={cn('block truncate', s.name ? 'text-xs text-muted-foreground' : 'text-sm')}>{s.email}</span>
                  </span>
                  <PermissionSelect value={s.permission} onChange={(p) => void change(s.id, p)} />
                  <Button variant="ghost" size="icon-xs" aria-label={`Stop sharing with ${s.email}`} onClick={() => void remove(s.id, s.name || s.email)}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A small pill on a card: "Shared · 2" on your own items, or who shared it and what you can do on
 * theirs.
 */
export function ShareBadge({ item, onClick }: { item: Shared; onClick?: () => void }) {
  if (item.owner) {
    const Icon = item.access === 'edit' ? Pencil : Eye
    return (
      <Tooltip>
        <TooltipTrigger render={<Badge variant="secondary" className="shrink-0 gap-1 font-normal" />}>
          <Icon className="size-3" /> {shortName(item.owner)}
        </TooltipTrigger>
        <TooltipContent>
          Shared by {item.owner.name || item.owner.email} · {item.access === 'edit' ? 'you can edit' : 'view only'}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (item.sharedWith.length === 0) return null
  const names = item.sharedWith.map((s) => s.name || s.email).join(', ')
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
          />
        }
      >
        <Users className="size-3" /> {item.sharedWith.length}
      </TooltipTrigger>
      <TooltipContent>Shared with {names}</TooltipContent>
    </Tooltip>
  )
}
