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
import { Skeleton } from "@/components/ui/skeleton"
import { SmtpCardFields } from "@/components/admin/smtp-card-fields"
import type { SmtpForm, SmtpSettings } from "@/components/admin/smtp-types"
import { adminFetch, smtpKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"
import { toastError } from "@/lib/toast"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"

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
	const { saved: saveFlash, flash: flashSave } = useSavedFlash()
	const { saved: testFlash, flash: flashTest } = useSavedFlash()

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
			dkimDomainName: smtp.data.dkimDomainName,
			dkimKeySelector: smtp.data.dkimKeySelector,
			dkimPrivateKey: "",
		}
		return { ...base, ...edits }
	}, [smtp.data, edits])

	function patch<Key extends keyof SmtpForm>(key: Key, value: SmtpForm[Key]) {
		setEdits((previous) => ({ ...previous, [key]: value }))
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
				dkimDomainName: form.dkimDomainName.trim(),
				dkimKeySelector: form.dkimKeySelector.trim(),
			}
			if (form.password.trim()) {
				body.password = form.password
			}
			if (form.dkimPrivateKey.trim()) {
				body.dkimPrivateKey = form.dkimPrivateKey
			}
			await adminFetch<SmtpSettings>("smtp", {
				method: "PUT",
				body: JSON.stringify(body),
			})
			await smtp.refetch()
			setEdits({})
			void queryClient.invalidateQueries({ queryKey: smtpKey })
			toast.success("SMTP settings saved")
			flashSave()
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
			flashTest()
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
				<CardAction className="flex items-center gap-2">
					<SavedIndicator saved={saveFlash} />
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
				{smtp.isPending ? (
					<div className="grid gap-3">
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				) : null}
				{smtp.error && !smtp.data ? (
					<QueryError
						message={smtp.error.message}
						onRetry={() => void smtp.refetch()}
					/>
				) : null}
				{form && smtp.data ? (
					<SmtpCardFields
						form={form}
						server={smtp.data}
						patch={patch}
						testTo={testTo}
						onTestToChange={setTestTo}
						testing={testing}
						testFlash={testFlash}
						onSendTest={() => void sendTest()}
					/>
				) : null}
			</CardContent>
		</Card>
	)
}
