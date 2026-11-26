import { WithContextMenu } from "@/components/layout/app-context-menu"
import { Button, buttonVariants } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Tip, TipKind } from "@/lib/advisor"
import { cn } from "cn"
import { ArrowRight, BellOff, EyeOff, MoreHorizontal } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { hrefTarget } from "@/components/common/href-target"
import { headline, KIND_META, perYear } from "./advisor-meta.ts"

/** Round icon badge for a tip, coloured by its kind. */
export function TipIcon({
	kind,
	className,
}: {
	kind: TipKind
	className?: string
}) {
	const meta = KIND_META[kind]
	const Icon = meta.icon
	return (
		<span
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-lg",
				meta.className,
				className
			)}
		>
			<Icon className="size-4.5" />
		</span>
	)
}

/** One piece of advice: what's going on, what it's worth, and what to do about it. */
export function TipCard({
	tip,
	onDismiss,
	compact,
}: {
	tip: Tip
	onDismiss: (tip: Tip, days?: number) => void
	compact?: boolean
}) {
	const meta = KIND_META[tip.kind]
	const saving = tip.yearly !== undefined &&
		tip.yearly >= 5 &&
		tip.kind !== "win" && (
			<span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
				~{perYear(tip.yearly)}
			</span>
		)
	const menuItems = (
		<>
			<DropdownMenuItem onClick={() => onDismiss(tip, 30)}>
				<BellOff /> Snooze for 30 days
			</DropdownMenuItem>
			<DropdownMenuItem onClick={() => onDismiss(tip)}>
				<EyeOff /> Not useful, hide it
			</DropdownMenuItem>
		</>
	)
	const menuButton = (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						className="-mt-1 -mr-1 size-7 shrink-0 text-muted-foreground"
						aria-label="Tip options"
					/>
				}
			>
				<MoreHorizontal />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				{menuItems}
			</DropdownMenuContent>
		</DropdownMenu>
	)

	// The dashboard's version: the finding in one sentence, then what to do about it.
	if (compact) {
		return (
			<WithContextMenu menu={menuItems} className="w-48">
				<article
					className={cn(
						"flex flex-col gap-2 rounded-lg border p-3",
						meta.card
					)}
				>
				<div className="flex items-start gap-2.5">
					<TipIcon kind={tip.kind} className="size-8" />
					<h3 className="min-w-0 flex-1 self-center text-sm leading-snug font-medium">
						{tip.title}
					</h3>
					{menuButton}
				</div>
				<p className="text-sm text-muted-foreground">
					{headline(tip.body)}
				</p>
				{(tip.action || saving) && (
					<div className="flex items-center justify-between gap-2 pt-1">
						{tip.action ? (
							<Link
								{...hrefTarget(tip.action.to)}
								className={cn(
									buttonVariants({
										variant: "ghost",
										size: "sm",
									}),
									"-ml-2 h-7 px-2 font-medium",
									meta.text
								)}
							>
								{tip.action.label} <ArrowRight />
							</Link>
						) : (
							<span />
						)}
						{saving}
					</div>
				)}
			</article>
			</WithContextMenu>
		)
	}

	return (
		<WithContextMenu menu={menuItems} className="w-48">
			<article className={cn("flex gap-3 rounded-lg border p-4", meta.card)}>
			<TipIcon kind={tip.kind} />
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<div className="flex items-start gap-2">
					<h3 className="min-w-0 flex-1 text-sm leading-snug font-medium">
						{tip.title}
					</h3>
					{saving}
					{menuButton}
				</div>
				<p className="text-sm text-muted-foreground">{tip.body}</p>
				{tip.action && (
					<div className="flex justify-start pt-1">
						<Link
							{...hrefTarget(tip.action.to)}
							className={cn(
								buttonVariants({
									variant: "outline",
									size: "sm",
								}),
								"bg-background/60"
							)}
						>
							{tip.action.label} <ArrowRight />
						</Link>
					</div>
				)}
			</div>
		</article>
		</WithContextMenu>
	)
}
