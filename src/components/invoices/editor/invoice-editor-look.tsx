import { Hint } from "@/components/common/hint"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { TemplateThumb } from "@/components/invoices/editor/template-thumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TEMPLATES, THEMES } from "@/lib/invoice"
import { cn } from "cn"

export function InvoiceEditorLook({ model }: { model: InvoiceEditorModel }) {
  const { d, set } = model
  return (
    <Card>
      <CardHeader>
        <CardTitle>Look</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={d.template === t.id}
              onClick={() => set("template", t.id)}
              className={cn(
                "grid gap-2 rounded-lg border p-2 text-sm transition-colors hover:bg-muted/40",
                d.template === t.id && "border-primary ring-1 ring-primary"
              )}
            >
              <TemplateThumb
                template={t.id}
                color={
                  THEMES.find((x) => x.id === d.theme)?.swatch ?? "#18181b"
                }
              />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <Hint key={t.id} label={t.label}>
              <button
                type="button"
                aria-label={`${t.label} colours`}
                aria-pressed={d.theme === t.id}
                onClick={() => set("theme", t.id)}
                className={cn(
                  "size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                  d.theme === t.id && "ring-2 ring-foreground/70"
                )}
                style={{ backgroundColor: t.swatch }}
              />
            </Hint>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
