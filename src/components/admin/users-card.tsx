import { useQuery } from "@tanstack/react-query"
import {
  Ban,
  Crown,
  KeyRound,
  Loader2,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  ShieldMinus,
  Trash2,
  UserCheck,
  UserPlus,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type AdminUser,
  type UserDialog,
  isDemoEmail,
  usersKey,
} from "@/components/admin/admin-types"
import { userInitials, userJoined } from "@/components/admin/admin-user-utils"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import {
  AddUserDialog,
  AdminUserConfirmDialog,
  SetPasswordDialog,
} from "@/components/admin/user-dialogs"
import { authClient, useSession } from "@/lib/auth-client"
import { auditKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"

export function UsersCard() {
  const { data: session } = useSession()
  const settings = useAdminSettings()
  const ownerId = settings.data?.ownerId ?? null
  const iAmOwner = !!session && session.user.id === ownerId
  const users = useQuery({
    queryKey: usersKey,
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUsers({
        query: { limit: 500, sortBy: "createdAt", sortDirection: "asc" },
      })
      if (error) throw new Error(error.message ?? "Could not load users")
      return (data.users as AdminUser[]).filter((u) => !isDemoEmail(u.email))
    },
  })
  const [dialog, setDialog] = useState<UserDialog | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(
    user: AdminUser,
    label: string,
    run: () => Promise<{ error: { message?: string } | null }>
  ) {
    setBusy(user.id)
    const { error } = await run()
    setBusy(null)
    if (error) toast.error(error.message ?? "Something went wrong")
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
          Each person sees only their own banks and data. Admins can also open
          this page; only the owner can choose who’s an admin.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setDialog({ type: "add" })}>
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
        {users.error && (
          <p className="text-sm text-destructive">{users.error.message}</p>
        )}
        {users.data?.map((u, i) => {
          const isMe = u.id === session?.user.id
          const isAdmin = u.role === "admin"
          const isOwner = u.id === ownerId
          // Nobody else can manage the owner's account.
          const manageable = !isMe && (!isOwner || iAmOwner)
          return (
            <div
              key={u.id}
              className="flex animate-in items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-300 fade-in-0 fill-mode-both hover:bg-muted/60"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                  {userInitials(u)}
                </AvatarFallback>
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
                  {u.mustChangePassword && (
                    <Badge variant="outline">Temporary password</Badge>
                  )}
                  {u.banned && <Badge variant="destructive">Banned</Badge>}
                  {u.twoFactorEnabled && (
                    <Badge variant="secondary">
                      <ShieldCheck /> 2FA
                    </Badge>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {u.email} · joined {userJoined.format(new Date(u.createdAt))}
                </div>
              </div>
              {busy === u.id && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {manageable && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Manage ${u.name || u.email}`}
                        disabled={busy === u.id}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {iAmOwner && (
                      <DropdownMenuItem
                        onClick={() => setDialog({ type: "role", user: u })}
                      >
                        {isAdmin ? <ShieldMinus /> : <ShieldCheck />}{" "}
                        {isAdmin ? "Remove admin" : "Make admin"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setDialog({ type: "password", user: u })}
                    >
                      <KeyRound /> Set temporary password
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        void act(u, "Signed out everywhere", () =>
                          authClient.admin.revokeUserSessions({ userId: u.id })
                        )
                      }
                    >
                      <LogOut /> Sign out everywhere
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {u.banned ? (
                      <DropdownMenuItem
                        onClick={() =>
                          void act(u, "Access restored", () =>
                            authClient.admin.unbanUser({ userId: u.id })
                          )
                        }
                      >
                        <UserCheck /> Restore access
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => setDialog({ type: "ban", user: u })}
                      >
                        <Ban /> Block sign-in
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDialog({ type: "delete", user: u })}
                    >
                      <Trash2 /> Delete user
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })}
      </CardContent>

      <AddUserDialog
        open={dialog?.type === "add"}
        canAddAdmins={iAmOwner}
        onClose={() => setDialog(null)}
        onAdded={refresh}
      />
      <SetPasswordDialog
        user={dialog?.type === "password" ? dialog.user : null}
        onClose={() => setDialog(null)}
        onDone={refresh}
      />
      <AdminUserConfirmDialog
        user={dialog?.type === "role" ? dialog.user : null}
        onClose={() => setDialog(null)}
        destructive={dialog?.type === "role" && dialog.user.role === "admin"}
        title={
          dialog?.type === "role" && dialog.user.role === "admin"
            ? "Remove their admin access?"
            : "Make this person an admin?"
        }
        description={(u) =>
          u.role === "admin"
            ? `${u.name || u.email} goes back to a regular account and loses access to this page.`
            : `${u.name || u.email} will be able to add, block and delete users, set temporary passwords, and open or close sign-ups. They can’t touch your account or change who’s an admin.`
        }
        action={
          dialog?.type === "role" && dialog.user.role === "admin"
            ? "Remove admin"
            : "Make admin"
        }
        run={async (u) => {
          const admin = u.role === "admin"
          const { error } = await authClient.admin.setRole({
            userId: u.id,
            role: admin ? "user" : "admin",
          })
          if (error) return error.message ?? "Could not change their role"
          toast.success(admin ? "No longer an admin" : "Now an admin")
          refresh()
          return null
        }}
      />
      <AdminUserConfirmDialog
        user={dialog?.type === "ban" ? dialog.user : null}
        onClose={() => setDialog(null)}
        title="Block this person from signing in?"
        description={(u) =>
          `${u.name || u.email} is signed out everywhere and can’t sign in until you restore access. Their data is kept.`
        }
        action="Block sign-in"
        run={async (u) => {
          const { error } = await authClient.admin.banUser({ userId: u.id })
          if (error) return error.message ?? "Could not block this user"
          toast.success("Sign-in blocked")
          refresh()
          return null
        }}
      />
      <AdminUserConfirmDialog
        user={dialog?.type === "delete" ? dialog.user : null}
        onClose={() => setDialog(null)}
        title="Delete this user and their data?"
        description={(u) =>
          `${u.name || u.email}’s account, linked banks, saved bank sign-ins, transactions, subscriptions, goals and work hours are removed for good. This can’t be undone.`
        }
        action="Delete user"
        confirmText={(u) => u.email}
        run={async (u) => {
          const { error } = await authClient.admin.removeUser({ userId: u.id })
          if (error) return error.message ?? "Could not delete this user"
          toast.success("User deleted")
          refresh()
          return null
        }}
      />
    </Card>
  )
}
