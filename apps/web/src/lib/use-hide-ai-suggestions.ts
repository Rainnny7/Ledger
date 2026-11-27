import { useSession } from "@/lib/auth-client"
import { useDemoPrefs } from "@/lib/demo"

/**
 * Settings → Preferences: when true, contextual Ask Ledger buttons are hidden (chat FAB still shows).
 */
export function useHideAiSuggestions(): boolean {
	const { data } = useSession()
	const demo = useDemoPrefs()
	return (
		demo.hideAiSuggestions ??
		(data?.user as { hideAiSuggestions?: boolean | null } | undefined)
			?.hideAiSuggestions ??
		false
	)
}