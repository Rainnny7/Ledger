import { AuthPageForm } from "@/pages/auth-page-form"
import { useAuthPage } from "@/pages/use-auth-page"

/**
 * The one page for logging in and signing up. It starts with just an email; the server says whether
 * that address has an account, and the rest of the form (password, or name and a new password)
 * slides in to match. Accounts with two-factor finish with a code step.
 */
export function AuthPage() {
	const auth = useAuthPage()
	return <AuthPageForm auth={auth} />
}
