import { useState } from "react"
import { toast } from "sonner"
import { CurrencySelect } from "@/components/common/currency-select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { authClient, useSession } from "@/lib/auth-client"
import { currencyName, useFx, useHomeCurrency } from "@/lib/currency"
import { demoMode, setDemoPrefs, useDemoPrefs } from "@/lib/demo"
import { formatDate } from "@/lib/format"
import { queryClient } from "@/lib/queries"

export function PreferencesCard() {
  const { data } = useSession()
  const demo = useDemoPrefs()
  const saved =
    demo.includeOverdraft ??
    (data?.user as { includeOverdraft?: boolean | null } | undefined)
      ?.includeOverdraft ??
    true
  const [pending, setPending] = useState<boolean | null>(null)
  const checked = pending ?? saved

  async function toggle(value: boolean) {
    if (demoMode) return setDemoPrefs({ includeOverdraft: value })
    setPending(value)
    const { error } = await authClient.updateUser({ includeOverdraft: value })
    if (error) toast.error(error.message ?? "Could not save that")
    else await queryClient.invalidateQueries()
    setPending(null)
  }

  const home = useHomeCurrency()
  const fx = useFx()
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)
  async function changeCurrency(code: string) {
    if (demoMode) {
      setDemoPrefs({ currency: code })
      toast.success(`Totals now show in ${currencyName(code)}`)
      return
    }
    setPendingCurrency(code)
    const { error } = await authClient.updateUser({ currency: code })
    if (error) toast.error(error.message ?? "Could not save that")
    else {
      toast.success(`Totals now show in ${currencyName(code)}`)
      await queryClient.invalidateQueries()
    }
    setPendingCurrency(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>How Ledger shows your money.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Label
            htmlFor="pref-currency"
            className="grid flex-1 basis-64 gap-1 font-normal"
          >
            <span className="font-medium">Default currency</span>
            <span className="text-sm text-muted-foreground">
              Totals across accounts, goals, subscriptions and jobs are shown in
              this currency, converting others at daily reference rates
              {fx?.date ? ` (last updated ${formatDate(fx.date)})` : ""}. New
              goals, subscriptions and jobs start in it too.
            </span>
          </Label>
          <CurrencySelect
            id="pref-currency"
            value={pendingCurrency ?? home}
            onChange={(c) => void changeCurrency(c)}
            disabled={pendingCurrency !== null}
            className="w-56"
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <Label htmlFor="pref-overdraft" className="grid gap-1 font-normal">
            <span className="font-medium">Include overdraft in balances</span>
            <span className="text-sm text-muted-foreground">
              Count the overdraft you can still draw on as part of your balance:
              totals, charts and the balance after each transaction. Turn off to
              see what the bank reports.
            </span>
          </Label>
          <Switch
            id="pref-overdraft"
            checked={checked}
            disabled={pending !== null}
            onCheckedChange={(v) => void toggle(v)}
          />
        </div>
      </CardContent>
    </Card>
  )
}
