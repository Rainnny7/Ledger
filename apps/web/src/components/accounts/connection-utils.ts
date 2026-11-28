import { isProviderId, PROVIDERS } from "@/components/accounts/providers"
import type { Connection } from "@/lib/api"

/** API keys (PayPal) are needed for every refresh, so they can't be forgotten separately. */
export function canForget(connection: Connection) {
	return (
		connection.savedCredentials &&
		!(
			isProviderId(connection.institution) &&
			PROVIDERS[connection.institution].keepsSecret
		)
	)
}
