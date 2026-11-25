import { createAuthClient } from "better-auth/react"
import {
  adminClient,
  inferAdditionalFields,
  twoFactorClient,
} from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  // Sign-in answers `{ twoFactorRedirect: true }` when a code is still needed; the sign-in form handles it.
  plugins: [
    twoFactorClient(),
    adminClient(),
    // Set while the account is on a temporary password an admin gave out.
    inferAdditionalFields({
      user: {
        mustChangePassword: { type: "boolean", required: false, input: false },
        // Settings → Preferences; balances add the overdraft you can draw on when this is on.
        includeOverdraft: { type: "boolean", required: false, input: true },
        // Settings → Preferences; the currency totals are converted to.
        currency: { type: "string", required: false, input: true },
        // Settings → Appearance; the colour theme, applied on every device you sign in on.
        theme: { type: "string", required: false, input: true },
      },
    }),
  ],
})

export const { useSession, signIn, signUp, signOut, twoFactor } = authClient
