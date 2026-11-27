import { Brand } from "@/components/layout/brand"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { usePageTitle } from "@/lib/page-title"

/** Intermediate page so mail scanners don't consume one-time login tokens. */
export function LoginLinkPage() {
	usePageTitle("Continue to Ledger")
	const token =
		new URLSearchParams(window.location.search).get("token")?.trim() ?? ""
	const valid = token.length > 0
	const verifyUrl = valid
		? `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent("/")}&newUserCallbackURL=${encodeURIComponent("/")}&errorCallbackURL=${encodeURIComponent("/login")}`
		: null
	return (
		<div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-muted/40 p-4">
			<Brand className="relative text-lg" />
			<Card className="relative w-full max-w-sm">
				<CardHeader>
					<CardTitle>Email login link</CardTitle>
					<CardDescription>
						{valid
							? "Press the button below to finish signing in. This extra step keeps automated mail scanners from using your link."
							: "This link is missing its token. Request a new login link from the sign-in page."}
					</CardDescription>
				</CardHeader>
				<CardContent />
				<CardFooter>
					{verifyUrl ? (
						<Button
							type="button"
							className="w-full"
							onClick={() => {
								window.location.href = verifyUrl
							}}
						>
							Continue to Ledger
						</Button>
					) : (
						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() => {
								window.location.href = "/login"
							}}
						>
							Back to sign in
						</Button>
					)}
				</CardFooter>
			</Card>
		</div>
	)
}
