import { Hint } from "@/components/common/hint"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { TemplateThumb } from "@/components/invoices/editor/template-thumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TEMPLATES, THEMES } from "@/lib/invoice"
import { cn } from "cn"

/** React/UI entry: `InvoiceEditorLook`. */
export function InvoiceEditorLook({ model }: { model: InvoiceEditorModel }) {
	const { draft, setDraftField } = model
	return (
		<Card>
			<CardHeader>
				<CardTitle>Look</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="grid grid-cols-3 gap-2">
					{TEMPLATES.map((template) => (
						<button
							key={template.id}
							type="button"
							aria-pressed={draft.template === template.id}
							onClick={() =>
								setDraftField("template", template.id)
							}
							className={cn(
								"grid gap-2 rounded-lg border p-2 text-sm transition-colors hover:bg-muted/40",
								draft.template === template.id &&
									"border-primary ring-1 ring-primary"
							)}
						>
							<TemplateThumb
								template={template.id}
								color={
									THEMES.find(
										(theme) => theme.id === draft.theme
									)?.swatch ?? "#18181b"
								}
							/>
							{template.label}
						</button>
					))}
				</div>
				<div className="flex flex-wrap gap-2">
					{THEMES.map((theme) => (
						<Hint key={theme.id} label={theme.label}>
							<button
								type="button"
								aria-label={`${theme.label} colours`}
								aria-pressed={draft.theme === theme.id}
								onClick={() => setDraftField("theme", theme.id)}
								className={cn(
									"size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
									draft.theme === theme.id &&
										"ring-2 ring-foreground/70"
								)}
								style={{ backgroundColor: theme.swatch }}
							/>
						</Hint>
					))}
				</div>
			</CardContent>
		</Card>
	)
}
