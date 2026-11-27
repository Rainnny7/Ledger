import { QueryError } from "@/components/ui/query-error"
import { MailIcon } from "@/components/icons/mail"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { adminFetch, smtpKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"
import { toastError } from "@/lib/toast"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

/** Outbound SMTP settings stored on the server. */
export type SmtpSettings = {
	host: string
	port: number
	secure: boolean
	username: string
	password?: string
	fromAddress: string
	fromName: string
	passwordSet: boolean
	configured: boolean
}

type SmtpForm = {
	host: string
	port: string
	secure: boolean
	username: string
	password: string
	fromAddress: string
	fromName: string
}

/** Admin form to configure outbound email (SMTP). */
export function SmtpCard() {
	const smtp = useQuery({
		queryKey: smtpKey,
		queryFn: () => adminFetch<SmtpSettings>("smtp"),
	})
	const [edits, setEdits] = useState<Partial<SmtpForm>>({})
	const [saving, setSaving] = useState(false)
	const [testTo, setTestTo] = useState("")
	const [testing, setTesting] = useState(false)

	const form = useMemo((): SmtpForm | null => {
		if (!smtp.data) {
			return null
		}
		const base: SmtpForm = {
			host: smtp.data.host,
			port: String(smtp.data.port || 587),
			secure: smtp.data.secure,
			username: smtp.data.username,
			password: "",
			fromAddress: smtp.data.fromAddress,
			fromName: smtp.data.fromName,
		}
		return { ...base, ...edits }
	}, [smtp.data, edits])

	function patch<K extends keyof SmtpForm>(key: K, value: SmtpForm[K]) {
		setEdits((prev) => ({ ...prev, [key]: value }))
	}

	async function save() {
		if (!form) {
			return
		}
		setSaving(true)
		try {
			const body: Partial<SmtpSettings> = {
				host: form.host.trim(),
				port: Number(form.port) || 587,
				secure: form.secure,
				username: form.username.trim(),
				fromAddress: form.fromAddress.trim(),
				fromName: form.fromName.trim(),
			}
			if (form.password.trim()) {
				body.password = form.password
			}
			await adminFetch<SmtpSettings>("smtp", {
				method: "PUT",
				body: JSON.stringify(body),
			})
			await smtp.refetch()
			setEdits({})
			void queryClient.invalidateQueries({ queryKey: smtpKey })
			toast.success("SMTP settings saved")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	async function sendTest() {
		const to = testTo.trim()
		if (!to) {
			return
		}
		setTesting(true)
		try {
			await adminFetch<{ ok: true }>("smtp/test", {
				method: "POST",
				body: JSON.stringify({ to }),
			})
			toast.success(`Test email sent to ${to}`)
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setTesting(false)
		}
	}

	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<MailIcon size={16} className="flex" />
					Outbound Email
				</CardTitle>
				<CardDescription>
					Optional SMTP for notification emails and password resets.
				</CardDescription>
				<CardAction>
					<Button
						size="sm"
						disabled={saving || !form || !!smtp.error}
						onClick={() => void save()}
					>
						{saving ? <Loader2 className="animate-spin" /> : null}
						Save
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-4">
				{smtp.isPending && (
					<div className="grid gap-3">
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				)}
				{smtp.error && !smtp.data && (
					<QueryError
						message={smtp.error.message}
						onRetry={() => void smtp.refetch()}
					/>
				)}
				{form && (
					<>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="grid gap-1.5 sm:col-span-2">
								<Label htmlFor="smtp-host">Host</Label>
								<Input
									id="smtp-host"
									value={form.host}
									onChange={(event) =>
										patch("host", event.target.value)
									}
									autoComplete="off"
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="smtp-port">Port</Label>
								<Input
									id="smtp-port"
									inputMode="numeric"
									value={form.port}
									onChange={(event) =>
										patch("port", event.target.value)
									}
								/>
							</div>
							<div className="flex items-center gap-2 pt-6">
								<Switch
									id="smtp-secure"
									checked={form.secure}
									onCheckedChange={(value) =>
										patch("secure", value)
									}
									aria-label="Use TLS"
								/>
								<Label
									htmlFor="smtp-secure"
									className="font-normal"
								>
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
										smtp.data?.passwordSet
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
								<Label htmlFor="smtp-from-name">
									From name
								</Label>
								<Input
									id="smtp-from-name"
									value={form.fromName}
									onChange={(event) =>
										patch("fromName", event.target.value)
									}
								/>
							</div>
						</div>
						<div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
							<div className="grid flex-1 gap-1.5">
								<Label htmlFor="smtp-test-to">
									Send test email
								</Label>
								<Input
									id="smtp-test-to"
									type="email"
									placeholder="you@example.com"
									value={testTo}
									onChange={(event) =>
										setTestTo(event.target.value)
									}
								/>
							</div>
							<Button
								type="button"
								variant="secondary"
								disabled={
									testing ||
									!testTo.trim() ||
									!smtp.data?.configured
								}
								onClick={() => void sendTest()}
							>
								{testing ? (
									<Loader2 className="animate-spin" />
								) : null}
								Send test
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	)
}
