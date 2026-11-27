import { useEffect } from "react"
import { MailCheck, MailWarning } from "lucide-react"
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
import { useSession } from "@/lib/auth-client"
import { usePageTitle } from "@/lib/page-title"
import { queryClient } from "@/lib/queries"

/** Landing page after the user follows a verify-email link from their inbox. */
export function EmailVerifiedPage() {
	usePageTitle("Email verified")
	const { refetch } = useSession()
	const search = new URLSearchParams(window.location.search)
	const error = search.get("error")?.trim() ?? ""
	const failed = error.length > 0
	useEffect(() => {
		// One refetch is enough: it updates the session store, and the queries depend on that.
		void refetch().then(() => queryClient.invalidateQueries())
	}, [refetch])
	return (
		<div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-muted/40 p-4">
			<Brand className="relative text-lg" />
			<Card className="relative w-full max-w-sm">
				<CardHeader>
					{failed ? (
						<>
							<CardTitle className="flex items-center gap-2">
								<MailWarning
									className="size-5 text-amber-600"
									aria-hidden
								/>
								Verification Link Expired or Invalid
							</CardTitle>
							<CardDescription>
								This link may have expired or already been used.
								Open Settings and send a new verification email
								if your address still needs confirming.
							</CardDescription>
						</>
					) : (
						<>
							<CardTitle className="flex items-center gap-2">
								<MailCheck
									className="size-5 text-green-600"
									aria-hidden
								/>
								Email Verified
							</CardTitle>
							<CardDescription>
								Your email is confirmed. You can now log in with
								email links.
							</CardDescription>
						</>
					)}
				</CardHeader>
				<CardContent />
				<CardFooter>
					<Button
						type="button"
						className="w-full"
						variant={failed ? "outline" : "default"}
						onClick={() => {
							window.location.href = failed
								? "/?settings=security"
								: "/"
						}}
					>
						{failed ? "Open Settings" : "Continue to Ledger"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	)
}
