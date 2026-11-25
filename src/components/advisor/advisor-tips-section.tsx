import { AREA_LABEL } from "@/components/advisor/advisor-meta"
import { TipCard } from "@/components/advisor/advisor-bits"
import { HiddenTipsDialog } from "@/components/advisor/hidden-tips-dialog"
import { Button } from "@/components/ui/button"
import type { Tip, TipArea } from "@/lib/advisor"
import { cn } from "cn"
import { RotateCcw } from "lucide-react"
import { useMemo, useState } from "react"

/** Tips grid with an area filter and a link to hidden tips. */
export function AdvisorTipsSection({
	tips,
	hiddenCount,
	hiddenTips,
	onDismiss,
	onRestore,
}: {
	tips: Tip[]
	hiddenCount: number
	hiddenTips: { tip: Tip; until: string | null }[]
	onDismiss: (tip: Tip, days?: number) => void
	onRestore: (id?: string) => Promise<void>
}) {
	const [area, setArea] = useState<TipArea | "all">("all")
	const [hiddenOpen, setHiddenOpen] = useState(false)

	const areas = useMemo(() => {
		const counts = new Map<TipArea, number>()
		for (const tip of tips) {
			counts.set(tip.area, (counts.get(tip.area) ?? 0) + 1)
		}
		return [...counts.entries()]
	}, [tips])
	const shown =
		area === "all" ? tips : tips.filter((tip) => tip.area === area)

	return (
		<section className="grid gap-4" aria-label="Tips">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-semibold">
					Tips{" "}
					<span className="font-normal text-muted-foreground">
						· {tips.length}
					</span>
				</h2>
				{hiddenCount > 0 && (
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground"
						onClick={() => setHiddenOpen(true)}
					>
						<RotateCcw /> {hiddenCount} hidden · Show again
					</Button>
				)}
				<HiddenTipsDialog
					items={hiddenTips}
					open={hiddenOpen}
					onOpenChange={setHiddenOpen}
					onRestore={onRestore}
				/>
			</div>
			{areas.length > 1 && (
				<div className="flex flex-wrap gap-2">
					{[["all", tips.length] as const, ...areas].map(
						([key, n]) => (
							<button
								key={key}
								type="button"
								onClick={() => setArea(key)}
								aria-pressed={area === key}
								className={cn(
									"rounded-full border px-3 py-1 text-sm transition-colors",
									area === key
										? "border-primary bg-primary text-primary-foreground"
										: "hover:bg-muted"
								)}
							>
								{key === "all" ? "All" : AREA_LABEL[key]}{" "}
								<span className="tabular-nums opacity-70">
									{n}
								</span>
							</button>
						)
					)}
				</div>
			)}
			{shown.length === 0 ? (
				<p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
					{tips.length === 0
						? "You're all caught up. New tips show up as your spending changes."
						: "No tips here."}
				</p>
			) : (
				<div className="grid gap-3 md:grid-cols-2">
					{shown.map((tip) => (
						<TipCard key={tip.id} tip={tip} onDismiss={onDismiss} />
					))}
				</div>
			)}
		</section>
	)
}
