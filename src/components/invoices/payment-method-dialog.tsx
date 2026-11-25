import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  api,
  type PaymentMethod,
  type PaymentMethodKind,
  type PaypalAppConnection,
} from "@/lib/api"
import { METHOD_KINDS, methodComplete, methodKind } from "@/lib/invoice"
import { fail } from "@/components/invoices/notify"

/** Add or edit one way of getting paid. Saved methods can be ticked on any invoice. */
export function PaymentMethodDialog({
  open,
  method,
  paypal,
  onClose,
  onSaved,
}: {
  open: boolean
  method: PaymentMethod | null
  paypal: PaypalAppConnection[]
  onClose: () => void
  onSaved?: (m: PaymentMethod) => void
}) {
  const [kind, setKind] = useState<PaymentMethodKind>("etransfer")
  const [label, setLabel] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [isDefault, setIsDefault] = useState(true)
  const [saving, setSaving] = useState(false)

  // Reset whenever the dialog opens or switches method. Done during render (not in an effect)
  // so the previous method's values never flash; the dialog stays mounted for its close animation.
  const [shown, setShown] = useState<{
    open: boolean
    method: PaymentMethod | null
  }>({ open: false, method: null })
  if (open !== shown.open || method !== shown.method) {
    setShown({ open, method })
    if (open) {
      setKind(method?.kind ?? "etransfer")
      setLabel(method?.label ?? "")
      setFields(method?.fields ?? {})
      setIsDefault(method?.isDefault ?? true)
    }
  }

  const def = methodKind(kind)
  const checkout = kind === "paypal-checkout"
  const fieldsFor =
    checkout && paypal.length === 1 && !fields.connectionId
      ? { connectionId: paypal[0]!.id }
      : fields
  const valid =
    methodComplete(kind, fieldsFor) &&
    (kind !== "link" || /^https:\/\//i.test(fieldsFor.url ?? ""))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const keys = checkout ? ["connectionId"] : def.fields.map((f) => f.key)
    const body = {
      kind,
      label: label.trim() || def.label,
      fields: Object.fromEntries(
        keys.map((k) => [k, (fieldsFor[k] ?? "").trim()]).filter(([, v]) => v)
      ),
      isDefault,
    }
    try {
      if (method) {
        await api.updatePaymentMethod(method.id, body)
        onSaved?.({ ...body, id: method.id })
      } else {
        const { method: created } = await api.createPaymentMethod(body)
        onSaved?.(created)
      }
      toast.success(method ? "Payment method saved" : `Added ${body.label}`)
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  const kindItems = METHOD_KINDS.map((k) => ({ value: k.kind, label: k.label }))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {method ? "Edit payment method" : "Add a payment method"}
          </DialogTitle>
          <DialogDescription>
            How people can pay you. It shows on the PDF and the invoice page,
            with copy buttons and QR codes.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              items={kindItems}
              value={kind}
              onValueChange={(v) => v && setKind(v as PaymentMethodKind)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHOD_KINDS.map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    <span className="flex flex-col">
                      <span>{k.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {k.hint}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pm-label">Name on the invoice</Label>
            <Input
              id="pm-label"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={def.label}
            />
          </div>

          {checkout ? (
            paypal.length ? (
              <div className="grid gap-2">
                <Label>PayPal account that gets paid</Label>
                <Select
                  items={paypal.map((p) => ({
                    value: p.id,
                    label: `${p.label} (${p.usernameMasked})`,
                  }))}
                  value={fieldsFor.connectionId ?? null}
                  onValueChange={(v) => v && setFields({ connectionId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {paypal.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label} ({p.usernameMasked})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Your client gets a “Pay with PayPal or card” button. Payments
                  land in this account and the invoice is marked paid on its
                  own.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Connect a PayPal account on Bank Accounts first (it uses your
                PayPal app’s client ID and secret). Until then, use the plain
                PayPal option with your PayPal.Me link.
              </p>
            )
          ) : (
            def.fields.map((f) => {
              const id = `pm-${f.key}`
              const Field = f.multiline ? Textarea : Input
              return (
                <div key={f.key} className="grid gap-2">
                  <Label htmlFor={id}>
                    {f.label}
                    {!f.required && def.fields.some((x) => x.required) && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        (optional)
                      </span>
                    )}
                  </Label>
                  <Field
                    id={id}
                    value={fields[f.key] ?? ""}
                    maxLength={500}
                    placeholder={f.placeholder}
                    onChange={(
                      e: React.ChangeEvent<
                        HTMLInputElement & HTMLTextAreaElement
                      >
                    ) => setFields((x) => ({ ...x, [f.key]: e.target.value }))}
                  />
                </div>
              )
            })
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            Tick it on new invoices
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {method ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
