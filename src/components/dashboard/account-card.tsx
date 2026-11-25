import {
  BalanceLabel,
  BalanceValue,
  CreditMeter,
  OverdraftMeter,
} from "@/components/accounts/account-figures"
import { AccountDetailsButton } from "@/components/accounts/account-details-dialog"
import { Money } from "@/components/common/money"
import {
  LinkMenuItems,
  WithContextMenu,
} from "@/components/layout/app-context-menu"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Account } from "@/lib/api"
import { ACCOUNT_TYPE_LABEL } from "@/lib/format"
import { ChevronRight } from "lucide-react"
import { Link, useNavigate } from "react-router"

export function AccountCard({ account: a }: { account: Account }) {
  const navigate = useNavigate()
  const to = `/accounts/${a.id}`
  // The whole card opens the account: the link sits underneath, the card lets clicks fall through to
  // it, and only the deposit-details button takes clicks itself.
  return (
    <WithContextMenu
      menu={
        <LinkMenuItems
          to={to}
          label="Open account"
          onOpen={() => void navigate(to)}
        />
      }
    >
      <div className="group relative rounded-xl has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
        <Link
          to={to}
          aria-label={`Open ${a.name}`}
          className="absolute inset-0 rounded-xl focus-visible:outline-none"
        />
        <Card className="pointer-events-none relative h-full transition-colors group-hover:bg-muted/50">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-sm">{a.name}</CardTitle>
                <CardDescription className="text-xs">
                  {a.numberMasked ?? ACCOUNT_TYPE_LABEL[a.type]}
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {a.type !== "wallet" && (
                  <AccountDetailsButton
                    account={a}
                    size="xs"
                    variant="ghost"
                    className="pointer-events-auto text-muted-foreground hover:text-foreground"
                    labelClassName="hidden @sm/card-header:inline"
                  />
                )}
                <Badge variant="secondary">{ACCOUNT_TYPE_LABEL[a.type]}</Badge>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">
                  <BalanceLabel account={a} />
                </div>
                <BalanceValue account={a} className="text-xl font-semibold" />
              </div>
              {a.available !== null && (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    {a.type === "credit" ? "Available credit" : "Available"}
                  </div>
                  <div className="text-sm tabular-nums">
                    <Money value={a.available} currency={a.currency} />
                  </div>
                </div>
              )}
            </div>
            <OverdraftMeter account={a} compact />
            <CreditMeter account={a} />
          </CardContent>
        </Card>
      </div>
    </WithContextMenu>
  )
}
