import type { ReactNode } from "react"
import { SavedIndicator } from "@/components/common/saved-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"

/** One feature flag row: title, description, saved flash, and switch. */
export function FeatureFlagToggleRow({
	title,
	description,
	badge,
	saved,
	pending,
	settingsError,
	checked,
	disabled,
	onCheckedChange,
	ariaLabel,
}: {
	title: ReactNode
	description: ReactNode
	badge?: ReactNode
	saved: boolean
	pending: boolean
	settingsError: boolean
	checked: boolean
	disabled?: boolean
	onCheckedChange: (value: boolean) => void
	ariaLabel: string
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="space-y-1">
				<p className="flex items-center gap-2 text-sm font-medium">
					{title}
					<SavedIndicator saved={saved} showLabel={false} />
					{badge}
				</p>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			{pending ? (
				<Skeleton className="h-5 w-9 shrink-0 rounded-full" />
			) : (
				<Switch
					className="shrink-0"
					checked={checked}
					disabled={disabled ?? settingsError}
					onCheckedChange={(value) => void onCheckedChange(value)}
					aria-label={ariaLabel}
				/>
			)}
		</div>
	)
}
