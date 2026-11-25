import { ArrowRight, Lightbulb } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { TipCard } from "@/components/advisor/advisor-bits"
import { perYear } from "@/components/advisor/advisor-meta"
import { useAdvice } from "@/components/advisor/use-advice"
import { buttonVariants } from "@/components/ui/button"
import { ReservedSlot } from "@/components/common/reserved-slot"
import { cn } from "cn"

/** The dashboard's Advisor strip: the few tips most worth acting on. Renders nothing when there are none. */
export function AdvisorSpotlight() {
	const { tips, dismiss, loading } = useAdvice()
	if (loading) {
		return (
			<ReservedSlot id="advisor" ready={false}>
				{null}
			</ReservedSlot>
		)
	}
	// Wins are nice to see on the Advisor page, but the dashboard keeps to things worth doing.
	const actionable = tips.filter((tip) => tip.kind !== "win")
	if (actionable.length === 0) {
		return (
			<ReservedSlot id="advisor" ready>
				{null}
			</ReservedSlot>
		)
	}

	const shown = actionable.slice(0, 3)
	const potential = actionable.reduce(
		(total, tip) => total + (tip.yearly ?? 0),
		0
	)

	return (
		<ReservedSlot id="advisor" ready>
			<section
				aria-label="Advisor tips"
				className="rounded-xl border bg-card p-4 sm:p-5"
			>
				<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<h2 className="flex items-center gap-2 font-semibold">
							<span className="flex size-6 items-center justify-center rounded-md bg-primary/12 text-primary">
								<Lightbulb className="size-3.5" />
							</span>
							Advisor
						</h2>
						{potential >= 20 && (
							<span className="text-sm text-muted-foreground tabular-nums">
								Up to ~{perYear(potential)} you could keep
							</span>
						)}
					</div>
					<Link
						to="/advisor"
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"-mr-2 text-muted-foreground"
						)}
					>
						{actionable.length > shown.length
							? `All ${tips.length} tips`
							: "Open Advisor"}{" "}
						<ArrowRight />
					</Link>
				</div>
				<div
					className={cn(
						"grid gap-3",
						shown.length > 1 && "md:grid-cols-2",
						shown.length > 2 && "lg:grid-cols-3"
					)}
				>
					{shown.map((tip) => (
						<TipCard
							key={tip.id}
							tip={tip}
							onDismiss={dismiss}
							compact
						/>
					))}
				</div>
			</section>
		</ReservedSlot>
	)
}
