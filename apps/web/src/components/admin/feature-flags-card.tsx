import { FeatureFlagsCardBody } from "@/components/admin/feature-flags-card-body"
import { useFeatureFlagToggles } from "@/components/admin/use-feature-flag-toggles"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { QueryError } from "@/components/ui/query-error"

/** Admin toggles for instance-wide features (sign-ups, AI chat). */
export function FeatureFlagsCard() {
	const toggleState = useFeatureFlagToggles()

	return (
		<Card>
			<CardHeader>
				<CardTitle>Feature Flags</CardTitle>
				<CardDescription>
					Turn optional features on or off for everyone on this
					server.
				</CardDescription>
			</CardHeader>
			{toggleState.settings.error && !toggleState.settings.data ? (
				<CardContent>
					<QueryError
						message={toggleState.settings.error.message}
						onRetry={() => void toggleState.settings.refetch()}
					/>
				</CardContent>
			) : (
				<CardContent className="grid gap-6">
					<FeatureFlagsCardBody {...toggleState} />
				</CardContent>
			)}
		</Card>
	)
}
