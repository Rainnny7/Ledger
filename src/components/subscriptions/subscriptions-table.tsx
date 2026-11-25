import { WithContextMenu } from "@/components/layout/app-context-menu"
import { confirmDialog } from "@/lib/confirm"
import { Money } from "@/components/common/money"
import {
  LogOut,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Share2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { subscriptionDueLabel } from "@/components/subscriptions/subscription-utils"
import { CategoryIcon } from "@/components/transactions/tx-bits"
import { Badge } from "@/components/ui/badge"
import { ShareBadge } from "@/components/sharing/share-bits"
import { leaveShared } from "@/lib/sharing"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { api, type Account, type Subscription } from "@/lib/api"
import { cycleLabel } from "@/lib/cycles"
import { formatLongDate, formatMoney, formatRelativeDate } from "@/lib/format"
import { cn } from "cn"

async function toggleSubscription(s: Subscription) {
  try {
    await api.updateSubscription(s.id, { active: !s.active })
    toast.success(s.active ? `${s.name} paused` : `${s.name} resumed`)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function removeSubscription(s: Subscription) {
  if (
    !(await confirmDialog({
      title: `Stop tracking ${s.name}?`,
      description:
        "It’s removed from your subscriptions. Your transactions aren’t affected.",
      action: "Stop tracking",
      destructive: true,
    }))
  )
    return
  try {
    await api.deleteSubscription(s.id)
    toast.success(`${s.name} removed`)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

export function SubscriptionsTable({
  sorted,
  accounts,
  focus,
  loading,
  onEdit,
  onShare,
}: {
  sorted: Subscription[]
  accounts: Account[]
  focus: Set<string>
  loading: boolean
  onEdit: (s: Subscription) => void
  onShare: (s: Subscription) => void
}) {
  if (loading) return null

  if (sorted.length === 0) return null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Name</TableHead>
          <TableHead className="hidden sm:table-cell">Next payment</TableHead>
          <TableHead className="hidden md:table-cell">Last charged</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden text-right lg:table-cell">
            Per month
          </TableHead>
          <TableHead className="w-12 pr-4" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((s) => {
          const account = accounts.find((a) => a.id === s.accountId)
          const changed =
            s.lastCharge &&
            Math.abs(Math.abs(s.lastCharge.amount) - s.amount) >= 0.01
          const menuItems = (
            <>
              {s.access !== "view" && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(s)}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void toggleSubscription(s)}>
                    {s.active ? <Pause /> : <Play />}{" "}
                    {s.active ? "Pause" : "Resume"}
                  </DropdownMenuItem>
                </>
              )}
              {s.access === "owner" ? (
                <>
                  <DropdownMenuItem onClick={() => onShare(s)}>
                    <Share2 /> Share
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void removeSubscription(s)}
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void leaveShared("subscription", s)}
                >
                  <LogOut /> Remove from my list
                </DropdownMenuItem>
              )}
            </>
          )
          return (
            <WithContextMenu key={s.id} className="w-48" menu={menuItems}>
              <TableRow
                data-focused={focus.has(s.id) || undefined}
                className={cn(
                  s.access !== "view" && "cursor-pointer",
                  !s.active && "opacity-60",
                  focus.has(s.id) &&
                    "bg-primary/8 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/12"
                )}
                onClick={() => onEdit(s)}
              >
                <TableCell className="w-full max-w-0 pl-4">
                  <div className="flex items-center gap-3">
                    <CategoryIcon
                      category={s.category}
                      className="hidden sm:flex"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{s.name}</span>
                        {!s.active && <Badge variant="outline">Paused</Badge>}
                        <span
                          role="presentation"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="contents"
                        >
                          <ShareBadge item={s} onClick={() => onShare(s)} />
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {cycleLabel(s.cycle)}
                        {account ? ` · ${account.name}` : ""}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap sm:table-cell">
                  {s.active ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className="cursor-default" />}
                      >
                        {subscriptionDueLabel(s.nextDue)}
                      </TooltipTrigger>
                      <TooltipContent>
                        {formatLongDate(s.nextDue)}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                  {s.lastCharge ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className="cursor-default" />}
                      >
                        {formatRelativeDate(s.lastCharge.date)}
                        {changed && (
                          <Badge variant="secondary" className="ml-2">
                            {formatMoney(
                              Math.abs(s.lastCharge.amount),
                              s.currency
                            )}
                          </Badge>
                        )}
                      </TooltipTrigger>
                      <TooltipContent>
                        {formatLongDate(s.lastCharge.date)} ·{" "}
                        {formatMoney(Math.abs(s.lastCharge.amount), s.currency)}
                        {changed ? " — different from the tracked amount" : ""}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  <Money value={s.amount} currency={s.currency} />
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">
                  <Money value={s.monthly} currency={s.currency} />
                </TableCell>
                <TableCell
                  className="pr-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${s.name} options`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {menuItems}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </WithContextMenu>
          )
        })}
      </TableBody>
    </Table>
  )
}
