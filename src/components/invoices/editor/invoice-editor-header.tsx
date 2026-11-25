import { ForeignMoney } from "@/components/common/money"
import { StateBadge } from "@/components/invoices/state-badge"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, Save, Send } from "lucide-react"
import { Link } from "react-router"

export function InvoiceEditorHeader({ model }: { model: InvoiceEditorModel }) {
  const { saved, state, saving, dirty, save, money } = model
  const paidLine =
    saved && saved.paid > 0 ? (
      <p className="text-sm text-muted-foreground">
        <ForeignMoney value={saved.paid} currency={model.d.currency}>
          {money(saved.paid)}
        </ForeignMoney>{" "}
        paid ·{" "}
        <ForeignMoney value={saved.balance} currency={model.d.currency}>
          {money(saved.balance)}
        </ForeignMoney>{" "}
        left
      </p>
    ) : null

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Back to invoices"
        render={<Link to="/invoices" />}
        nativeButton={false}
      >
        <ArrowLeft />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">
          {saved ? `Invoice ${saved.number}` : "New invoice"}
          {state && <StateBadge state={state} />}
        </h1>
        {paidLine}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={saving !== null}
          onClick={() => void save("stay")}
        >
          {saving === "save" ? <Loader2 className="animate-spin" /> : <Save />}
          {saved ? "Save" : "Save draft"}
        </Button>
        <Button disabled={saving !== null} onClick={() => void save("send")}>
          {saving === "send" ? <Loader2 className="animate-spin" /> : <Send />}
          {saved && !dirty ? "Send" : "Save & send"}
        </Button>
      </div>
    </div>
  )
}
