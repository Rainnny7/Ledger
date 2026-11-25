import { ChevronRight, ExternalLink, LockKeyhole } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/** React/UI entry: `PaypalFields`. */
export function PaypalFields({
	username,
	setUsername,
	password,
	setPassword,
}: {
	username: string
	setUsername: (value: string) => void
	password: string
	setPassword: (value: string) => void
}) {
	return (
		<>
			<details className="group rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground [&_summary::-webkit-details-marker]:hidden">
				<summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground select-none">
					<ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
					How do I get these?
				</summary>
				<ol className="mt-2 ml-4 grid list-decimal gap-1.5 pb-1">
					<li>
						Sign in at{" "}
						<a
							href="https://developer.paypal.com/dashboard/applications/live"
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
						>
							developer.paypal.com{" "}
							<ExternalLink className="size-3" />
						</a>{" "}
						with your PayPal account and switch to <b>Live</b>.
					</li>
					<li>
						Create an app (type <b>Merchant</b>), then under its
						features tick <b>Transaction Search</b> and save.
					</li>
					<li>Copy the app’s Client ID and Secret here.</li>
				</ol>
				<p className="mt-2">
					Transaction Search needs a PayPal Business account (free to
					upgrade to). New permissions and new payments can take up to
					3 hours to show up.
				</p>
			</details>
			<div className="grid gap-2">
				<Label htmlFor="pp-client">Client ID</Label>
				<Input
					id="pp-client"
					autoComplete="off"
					spellCheck={false}
					value={username}
					onChange={(event) => setUsername(event.target.value.trim())}
					required
					autoFocus
					className="font-mono text-xs"
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="pp-secret">Secret</Label>
				<Input
					id="pp-secret"
					type="password"
					autoComplete="off"
					value={password}
					onChange={(event) => setPassword(event.target.value.trim())}
					required
					className="font-mono text-xs"
				/>
			</div>
			<p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
				<LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
				Ledger only reads balances and transactions. The keys are kept
				encrypted (AES-256-GCM) on your server so it can refresh; remove
				the connection or delete the app on PayPal to revoke access.
			</p>
		</>
	)
}
