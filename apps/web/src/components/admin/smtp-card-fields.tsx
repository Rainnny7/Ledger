import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import type { SmtpForm } from "@/components/admin/smtp-types"
import type { SmtpSettings } from "@/components/admin/smtp-types"
import { Loader2 } from "lucide-react"
import { SavedIndicator } from "@/components/common/saved-indicator"

/** Editable SMTP + DKIM fields and the send-test row. */
export function SmtpCardFields({
	form,
	server,
	patch,
	testTo,
	onTestToChange,
	testing,
	testFlash,
	onSendTest,
}: {
	form: SmtpForm
	server: SmtpSettings
	patch: <Key extends keyof SmtpForm>(key: Key, value: SmtpForm[Key]) => void
	testTo: string
	onTestToChange: (value: string) => void
	testing: boolean
	testFlash: boolean
	onSendTest: () => void
}) {
	return (
		<>
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="grid gap-1.5 sm:col-span-2">
					<Label htmlFor="smtp-host">Host</Label>
					<Input
						id="smtp-host"
						value={form.host}
						onChange={(event) => patch("host", event.target.value)}
						autoComplete="off"
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-port">Port</Label>
					<Input
						id="smtp-port"
						inputMode="numeric"
						value={form.port}
						onChange={(event) => patch("port", event.target.value)}
					/>
				</div>
				<div className="flex items-center gap-2 pt-6">
					<Switch
						id="smtp-secure"
						checked={form.secure}
						onCheckedChange={(value) => patch("secure", value)}
						aria-label="Use TLS"
					/>
					<Label htmlFor="smtp-secure" className="font-normal">
						Use TLS (secure)
					</Label>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-user">Username</Label>
					<Input
						id="smtp-user"
						value={form.username}
						onChange={(event) =>
							patch("username", event.target.value)
						}
						autoComplete="off"
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-pass">Password</Label>
					<Input
						id="smtp-pass"
						type="password"
						value={form.password}
						placeholder={
							server.passwordSet
								? "Password saved — leave blank to keep"
								: "Not set"
						}
						onChange={(event) =>
							patch("password", event.target.value)
						}
						autoComplete="new-password"
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-from">From Address</Label>
					<Input
						id="smtp-from"
						type="email"
						value={form.fromAddress}
						onChange={(event) =>
							patch("fromAddress", event.target.value)
						}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-from-name">From name</Label>
					<Input
						id="smtp-from-name"
						value={form.fromName}
						onChange={(event) =>
							patch("fromName", event.target.value)
						}
					/>
				</div>
			</div>
			<div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
				<p className="text-sm text-muted-foreground sm:col-span-2">
					DKIM signing is optional. Only fill this in if your SMTP
					server doesn't already sign outgoing mail. Clear the domain
					to turn it off.
				</p>
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-dkim-domain">DKIM domain</Label>
					<Input
						id="smtp-dkim-domain"
						placeholder="example.com"
						value={form.dkimDomainName}
						onChange={(event) =>
							patch("dkimDomainName", event.target.value)
						}
						autoComplete="off"
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="smtp-dkim-selector">DKIM selector</Label>
					<Input
						id="smtp-dkim-selector"
						placeholder="ledger"
						value={form.dkimKeySelector}
						onChange={(event) =>
							patch("dkimKeySelector", event.target.value)
						}
						autoComplete="off"
					/>
				</div>
				<div className="grid gap-1.5 sm:col-span-2">
					<Label htmlFor="smtp-dkim-key">
						DKIM private key (PEM)
					</Label>
					<Textarea
						id="smtp-dkim-key"
						rows={4}
						className="font-mono text-xs"
						value={form.dkimPrivateKey}
						placeholder={
							server.dkimPrivateKeySet
								? "Key saved — leave blank to keep"
								: "-----BEGIN PRIVATE KEY-----"
						}
						onChange={(event) =>
							patch("dkimPrivateKey", event.target.value)
						}
						autoComplete="off"
						spellCheck={false}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
				<div className="grid flex-1 gap-1.5">
					<Label htmlFor="smtp-test-to">Send test email</Label>
					<Input
						id="smtp-test-to"
						type="email"
						placeholder="you@example.com"
						value={testTo}
						onChange={(event) => onTestToChange(event.target.value)}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="secondary"
						disabled={
							testing || !testTo.trim() || !server.configured
						}
						onClick={onSendTest}
					>
						{testing ? <Loader2 className="animate-spin" /> : null}
						Send test
					</Button>
					<SavedIndicator saved={testFlash} showLabel={false} />
				</div>
			</div>
		</>
	)
}
