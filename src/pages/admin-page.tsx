import { ActivityCard } from "@/components/admin/activity-card"
import { BuildInfo } from "@/components/admin/build-info"
import { DemoCard } from "@/components/admin/demo-card"
import { SignupsCard } from "@/components/admin/signups-card"
import { BackupsCard } from "@/components/admin/backups-card"
import { TasksCard } from "@/components/admin/tasks-card"
import { UpdateStatus } from "@/components/admin/update-status"
import { UsersCard } from "@/components/admin/users-card"

export function AdminPage() {
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            People who can use this Ledger, and who may sign up.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <BuildInfo />
          <UpdateStatus />
        </div>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <div className="grid gap-8">
          <SignupsCard />
          <DemoCard />
        </div>
        <UsersCard />
      </div>
      <TasksCard />
      <BackupsCard />
      <ActivityCard />
    </div>
  )
}
