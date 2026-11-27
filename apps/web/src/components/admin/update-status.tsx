import { Hint } from "@/components/common/hint"
import { Badge } from "@/components/ui/badge"
import { useUpdate } from "@/lib/queries"
import { isPrereleaseVersion } from "@/lib/version"

/** Running version and whether GitHub reports something newer. */
export function UpdateStatus() {
	const { data, isError, isPending } = useUpdate(true)
	if (data && !data.checkEnabled) {
		const prerelease =
			isPrereleaseVersion(data.current) ||
			isPrereleaseVersion(import.meta.env.VITE_APP_VERSION)
		return (
			<div className="flex items-center gap-2">
				{prerelease && (
					<Badge
						variant="outline"
						className="h-5 text-[10px] uppercase"
					>
						Dev build
					</Badge>
				)}
				<Hint label="Update checks are turned off on this server (UPDATE_CHECK=false)">
					<span className="cursor-default text-xs text-muted-foreground">
						v{data.current} · update checks off
					</span>
				</Hint>
			</div>
		)
	}
	if (isPending) {
		return (
			<span className="text-xs text-muted-foreground">
				Checking for updates…
			</span>
		)
	}
	const current = data?.current ?? "—"
	const buildVersion = import.meta.env.VITE_APP_VERSION
	const prerelease =
		isPrereleaseVersion(current) || isPrereleaseVersion(buildVersion)
	let detail = isError ? "check failed" : "up to date"
	if (data?.available && data.latest) {
		detail = `v${data.latest} available`
	} else if (data?.latest && !data.available) {
		detail = "up to date"
	}
	return (
		<div className="flex items-center gap-2">
			{prerelease && (
				<Badge variant="outline" className="h-5 text-[10px] uppercase">
					Dev build
				</Badge>
			)}
			<Hint label={`Ledger ${current} · ${detail}`}>
				<span className="cursor-default text-xs text-muted-foreground">
					v{current} · {detail}
				</span>
			</Hint>
		</div>
	)
}
