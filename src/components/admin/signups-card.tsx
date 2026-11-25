import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import { adminFetch, auditKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"

export function SignupsCard() {
  const settings = useAdminSettings()
  const [saving, setSaving] = useState(false)
  const open = settings.data?.registrationOpen ?? false

  async function toggle(next: boolean) {
    setSaving(true)
    try {
      await adminFetch("settings", {
        method: "PUT",
        body: JSON.stringify({ registrationOpen: next }),
      })
      await settings.refetch()
      void queryClient.invalidateQueries({ queryKey: auditKey })
      toast.success(
        next ? "Anyone can now create an account" : "Sign-ups closed"
      )
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
          {settings.data &&
            (open ? (
              <Badge>Open</Badge>
            ) : (
              <Badge variant="secondary">Closed</Badge>
            ))}
        </CardTitle>
        <CardDescription>
          Let anyone with the link create their own account. You can still add
          people yourself when this is off.
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
