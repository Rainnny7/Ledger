import { createAuthClient } from "better-auth/react"
import {
	adminClient,
	inferAdditionalFields,
	twoFactorClient,
} from "better-auth/client/plugins"

/** Better Auth client with 2FA, admin, and Ledger user preference fields. */
export const authClient = createAuthClient({
	baseURL: window.location.origin,
	// Login answers `{ twoFactorRedirect: true }` when a code is still needed; the login form handles it.
	plugins: [
		twoFactorClient(),
		adminClient(),
		// Set while the account is on a temporary password an admin gave out.
		inferAdditionalFields({
			user: {
				mustChangePassword: {
					type: "boolean",
					required: false,
					input: false,
				},
				// Settings → Preferences; balances add the overdraft you can draw on when this is on.
				includeOverdraft: {
					type: "boolean",
					required: false,
					input: true,
				},
				// Settings → Preferences; the currency totals are converted to.
				currency: { type: "string", required: false, input: true },
				// Settings → Appearance; the mode (system / light / dark / AMOLED), applied on every device you log in on.
				theme: { type: "string", required: false, input: true },
				// Settings → Appearance; the accent colour, used with any mode.
				accent: { type: "string", required: false, input: true },
			},
		}),
	],
})

/** Session hook and sign-in/out helpers from the shared auth client. */
export const { useSession, signIn, signUp, signOut, twoFactor } = authClient
