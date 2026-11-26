import { useOnboarding } from "@/components/onboarding/onboarding-provider"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"

/** Settings entry to replay the product tour. */
export function OnboardingCard() {
	const { startOnboarding } = useOnboarding()
	return (
		<Card>
			<CardHeader>
				<CardTitle>Onboarding</CardTitle>
				<CardDescription>
					Walk through the sidebar and main actions again.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button type="button" variant="secondary" onClick={startOnboarding}>
					Restart onboarding
				</Button>
			</CardContent>
		</Card>
	)
}