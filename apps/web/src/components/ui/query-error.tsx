import { TriangleAlertIcon } from "lucide-react"
import {
	Alert,
	AlertAction,
	AlertDescription,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/** Inline failure state for a query with no cached data yet. */
export function QueryError({
	message,
	onRetry,
}: {
	message: string
	onRetry: () => void
}) {
	return (
		<Alert variant="destructive">
			<TriangleAlertIcon />
			<AlertDescription>{message}</AlertDescription>
			<AlertAction>
				<Button
					variant="outline"
					size="sm"
					onClick={onRetry}
				>
					Try again
				</Button>
			</AlertAction>
		</Alert>
	)
}