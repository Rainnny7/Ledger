import { MoreHorizontal, Plus, Wallet } from "lucide-react"
import { WithContextMenu } from "@/components/layout/app-context-menu"
import { PaymentMethodMenu } from "@/components/invoices/payment-method-menu"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PaymentMethod } from "@/lib/api"
import { methodKind, methodLines } from "@/lib/invoice"

export function PaymentMethodsSection({
  methods,
  onAdd,
  onEdit,
  onRemove,
}: {
  methods: PaymentMethod[]
  onAdd: () => void
  onEdit: (m: PaymentMethod) => void
  onRemove: (m: PaymentMethod) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment methods</CardTitle>
        <CardDescription>
          How people can pay you. Tick the ones you want on each invoice.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Add e-Transfer, PayPal, crypto, a bank account or anything
            else, and it’s ready for every invoice.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {methods.map((m) => (
              <PaymentMethodCard
                key={m.id}
                method={m}
                onEdit={() => onEdit(m)}
                onRemove={() => onRemove(m)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PaymentMethodCard({
  method: m,
  onEdit,
  onRemove,
}: {
  method: PaymentMethod
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <WithContextMenu
      menu={
        <PaymentMethodMenu method={m} onEdit={onEdit} onRemove={onRemove} />
      }
    >
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <Wallet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {m.label}
            {m.isDefault && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                default
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {m.kind === "paypal-checkout"
              ? "PayPal / card checkout, marked paid automatically"
              : methodLines(m)
                  .map((l) => l.value)
                  .join(" · ") || methodKind(m.kind).label}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${m.label} options`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <PaymentMethodMenu method={m} onEdit={onEdit} onRemove={onRemove} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </WithContextMenu>
  )
}
