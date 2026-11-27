import {
	type AdminUser,
	isDemoEmail,
	usersKey,
} from "@/components/admin/admin-types"
import { type NotificationKind } from "@/lib/queries"
import { QueryError } from "@/components/ui/query-error"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { adminFetch, smtpKey } from "@/lib/admin"
import { toastError } from "@/lib/toast"
import { authClient } from "@/lib/auth-client"
import { useQuery } from "@tanstack/react-query"
import { BellRing, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"

const KIND_OPTIONS: { value: NotificationKind; label: string }[] = [
	{ value: "info", label: "Info" },
	{ value: "success", label: "Success" },
	{ value: "warning", label: "Warning" },
	{ value: "alert", label: "Alert" },
]

/** Admin form to broadcast in-app (and optional email) notifications. */
export function SendNotificationCard() {
	const users = useQuery({
		queryKey: usersKey,
		queryFn: async () => {
			const { data, error } = await authClient.admin.listUsers({
				query: {
					limit: 500,
					sortBy: "createdAt",
					sortDirection: "asc",
				},
			})
			if (error) {
				throw new Error(error.message ?? "Could not load users")
			}
			return (data.users as AdminUser[]).filter(
				(user) => !isDemoEmail(user.email)
			)
		},
	})
	const smtp = useQuery({
		queryKey: smtpKey,
		queryFn: () => adminFetch<{ configured: boolean }>("smtp"),
	})
	const [audience, setAudience] = useState<"all" | "pick">("all")
	const [picked, setPicked] = useState<Set<string>>(() => new Set())
	const [title, setTitle] = useState("")
	const [body, setBody] = useState("")
	const [kind, setKind] = useState<NotificationKind>("info")
	const [href, setHref] = useState("")
	const [emailAlso, setEmailAlso] = useState(false)
	const [sending, setSending] = useState(false)
	const { saved, flash } = useSavedFlash()

	const smtpReady = smtp.data?.configured === true

	function toggleUser(id: string, on: boolean) {
		setPicked((previous) => {
			const next = new Set(previous)
			if (on) {
				next.add(id)
			} else {
				next.delete(id)
			}
			return next
		})
	}

	async function send() {
		if (!title.trim() || !body.trim()) {
			return
		}
		if (audience === "pick" && picked.size === 0) {
			toastError("Choose at least one user")
			return
		}
		setSending(true)
		try {
			const result = await adminFetch<{ sent: number }>("notifications", {
				method: "POST",
				body: JSON.stringify({
					userIds: audience === "all" ? "all" : [...picked],
					title: title.trim(),
					body: body.trim(),
					kind,
					href: href.trim() || undefined,
					email: emailAlso,
				}),
			})
			toast.success(
				`Sent to ${result.sent} user${result.sent === 1 ? "" : "s"}`
			)
			flash()
			setTitle("")
			setBody("")
			setHref("")
			setEmailAlso(false)
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSending(false)
		}
	}

	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<BellRing className="size-4" />
					Send Notification
				</CardTitle>
				<CardDescription>
					Deliver an in-app notification to everyone or specific
					people.
				</CardDescription>
				<CardAction className="flex items-center gap-2">
					<SavedIndicator saved={saved} />
					<Button
						size="sm"
						disabled={sending || !!users.error}
						onClick={() => void send()}
					>
						{sending ? <Loader2 className="animate-spin" /> : null}
						Send
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-4">
				{users.error && !users.data && (
					<QueryError
						message={users.error.message}
						onRetry={() => void users.refetch()}
					/>
				)}
				<div className="grid gap-2">
					<Label>Recipients</Label>
					<RadioGroup
						value={audience}
						onValueChange={(value) =>
							setAudience(value as "all" | "pick")
						}
						className="gap-2"
					>
						<Label className="flex items-center gap-2 font-normal">
							<RadioGroupItem value="all" />
							All users
						</Label>
						<Label className="flex items-center gap-2 font-normal">
							<RadioGroupItem value="pick" />
							Choose users
						</Label>
					</RadioGroup>
					{audience === "pick" && (
						<div className="max-h-40 overflow-y-auto rounded-md border p-2">
							{users.isPending && (
								<Skeleton className="h-20 w-full" />
							)}
							{users.data?.map((user) => (
								<Label
									key={user.id}
									className="flex items-center gap-2 py-1 font-normal"
								>
									<Checkbox
										checked={picked.has(user.id)}
										onCheckedChange={(value) =>
											toggleUser(user.id, value === true)
										}
									/>
									<span className="truncate">
										{user.name}{" "}
										<span className="text-muted-foreground">
											({user.email})
										</span>
									</span>
								</Label>
							))}
						</div>
					)}
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="notify-title">Title</Label>
					<Input
						id="notify-title"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="notify-body">Message</Label>
					<Input
						id="notify-body"
						value={body}
						onChange={(event) => setBody(event.target.value)}
					/>
				</div>
				<div className="grid gap-1.5 sm:grid-cols-2">
					<div className="grid gap-1.5">
						<Label htmlFor="notify-kind">Kind</Label>
						<Select
							items={KIND_OPTIONS}
							value={kind}
							onValueChange={(value) =>
								value && setKind(value as NotificationKind)
							}
						>
							<SelectTrigger id="notify-kind" aria-label="Kind">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{KIND_OPTIONS.map((option) => (
									<SelectItem
										key={option.value}
										value={option.value}
									>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="notify-href">Link (optional)</Label>
						<Input
							id="notify-href"
							placeholder="/?settings=security"
							value={href}
							onChange={(event) => setHref(event.target.value)}
						/>
					</div>
				</div>
				<Label className="flex items-start gap-2 font-normal">
					<Checkbox
						checked={emailAlso}
						disabled={!smtpReady}
						onCheckedChange={(value) =>
							setEmailAlso(value === true)
						}
					/>
					<span>
						Also send email
						{!smtpReady && (
							<span className="block text-xs text-muted-foreground">
								Configure SMTP above to enable email delivery.
							</span>
						)}
					</span>
				</Label>
			</CardContent>
		</Card>
	)
}
