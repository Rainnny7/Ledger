import { ChevronDown, Plus, Trophy, Users } from "lucide-react"
import { AnimatedMoney } from "@/components/common/count-up"
import { GoalCard } from "@/components/goals/goal-card"
import { EmptyGoals } from "@/components/goals/empty-goals"
import { GoalDialog } from "@/components/goals/goal-dialog"
import { GoalPaymentDialog } from "@/components/goals/goal-payment-dialog"
import { GoalStatCard } from "@/components/goals/goal-stat-card"
import { useGoalsPage } from "@/components/goals/use-goals-page"
import { ShareDialog } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "cn"

export function GoalsPage() {
  const p = useGoalsPage()

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Save up for the things you want, or pay down what you owe — one
            payment at a time.
          </p>
        </div>
        <Button onClick={() => p.startNew()}>
          <Plus /> New goal
        </Button>
      </div>

      {p.error && <p className="text-sm text-destructive">{p.error.message}</p>}

      <Bones
        name="goals"
        className="grid gap-8"
        loading={!p.data && p.loading}
        fallback={
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        }
      >
        {p.goals.length === 0 && p.sharedOpen.length === 0 ? (
          <EmptyGoals onPick={p.startNew} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <GoalStatCard
                label="Put toward goals"
                value={<AnimatedMoney value={p.saved} />}
                hint={`${p.open.length} goal${p.open.length === 1 ? "" : "s"} in progress`}
              />
              <GoalStatCard
                label="Still to go"
                value={<AnimatedMoney value={p.remaining} />}
              />
              <GoalStatCard
                label="Needed per month"
                value={
                  p.perMonth > 0 ? <AnimatedMoney value={p.perMonth} /> : "—"
                }
                hint="To hit every deadline"
              />
              <GoalStatCard
                label="This month"
                value={
                  <AnimatedMoney value={p.thisMonth} sign={p.thisMonth !== 0} />
                }
                hint="Payments logged so far"
              />
            </div>

            {p.open.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {p.open.map((g) => (
                  <GoalCard key={g.id} goal={g} {...p.actions} />
                ))}
              </div>
            ) : (
              <Card className="items-center py-10 text-center">
                <CardContent className="flex flex-col items-center gap-3">
                  <Trophy className="size-8 text-amber-500" />
                  <p className="font-medium">
                    Every goal reached. What’s next?
                  </p>
                  <Button size="sm" onClick={() => p.startNew()}>
                    <Plus /> New goal
                  </Button>
                </CardContent>
              </Card>
            )}

            {p.sharedOpen.length > 0 && (
              <section className="grid gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="size-4 text-primary" /> Shared with you
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {p.sharedOpen.map((g) => (
                    <GoalCard key={g.id} goal={g} {...p.actions} />
                  ))}
                </div>
              </section>
            )}

            {p.reached.length > 0 && (
              <section className="grid gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="size-4 text-amber-500" /> Reached
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {p.reached.map((g) => (
                    <GoalCard key={g.id} goal={g} {...p.actions} />
                  ))}
                </div>
              </section>
            )}

            {p.archived.length > 0 && (
              <section className="grid gap-3">
                <button
                  type="button"
                  className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => p.setShowArchived((v) => !v)}
                >
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      !p.showArchived && "-rotate-90"
                    )}
                  />
                  Archived ({p.archived.length})
                </button>
                {p.showArchived && (
                  <div className="grid animate-in gap-4 opacity-80 duration-200 fade-in-0 md:grid-cols-2">
                    {p.archived.map((g) => (
                      <GoalCard key={g.id} goal={g} {...p.actions} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </Bones>

      <GoalDialog
        open={!!p.creating || !!p.editing}
        goal={p.editing}
        preset={p.creating}
        onClose={p.closeDialogs}
      />
      <GoalPaymentDialog draft={p.paying} onClose={p.closePaying} />
      <ShareDialog
        kind="goal"
        item={p.sharing}
        onClose={() => p.setSharing(null)}
      />
    </div>
  )
}
