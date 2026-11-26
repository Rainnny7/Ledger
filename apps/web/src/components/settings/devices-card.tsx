import { WithContextMenu } from "@/components/layout/app-context-menu"
import { useQuery } from "@tanstack/react-query"
import { Laptop, Loader2, LogOut, Smartphone } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { QueryError } from "@/components/ui/query-error"
import { authClient, useSession } from "@/lib/auth-client"

interface DeviceSession {
	id: string
	token: string
	userAgent?: string | null
	ipAddress?: string | null
	createdAt: Date | string
	updatedAt: Date | string
}

/** Lists logged-in devices and lets the user revoke any other session. */
export function DevicesCard() {
	const { data: current } = useSession()
	const sessions = useQuery({
		queryKey: ["auth", "sessions"],
		queryFn: async () => {
			const { data, error } = await authClient.listSessions()
			if (error) {
				throw new Error(error.message ?? "Could not load devices")
			}
			return (data as DeviceSession[]).toSorted(
				(first, second) =>
					+new Date(second.updatedAt) - +new Date(first.updatedAt)
			)
		},
	})
	const [busy, setBusy] = useState<string | null>(null)
	const currentId = current?.session.id
	const others = (sessions.data ?? []).filter(
		(session) => session.id !== currentId
	)

	async function revoke(session: DeviceSession) {
		setBusy(session.id)
		const { error } = await authClient.revokeSession({
			token: session.token,
		})
		setBusy(null)
		if (error) {
			toastError(error.message ?? "Could not log out that device")
		} else {
			toast.success("Device logged out")
		}
		void sessions.refetch()
	}

	async function revokeOthers() {
		setBusy("others")
		const { error } = await authClient.revokeOtherSessions()
		setBusy(null)
		if (error) {
			toastError(error.message ?? "Could not log out other devices")
		} else {
			toast.success("Logged out everywhere else")
		}
		void sessions.refetch()
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Devices</CardTitle>
				<CardDescription>
					Browsers logged in to your account. Log out any you don’t
					recognise.
				</CardDescription>
				{others.length > 0 && (
					<CardAction>
						<Button
							variant="outline"
							size="sm"
							disabled={busy === "others"}
							onClick={() => void revokeOthers()}
						>
							{busy === "others" ? (
								<Loader2 className="animate-spin" />
							) : (
								<LogOut />
							)}{" "}
							Logout others
						</Button>
					</CardAction>
				)}
			</CardHeader>
			<CardContent className="grid gap-1">
				{sessions.isPending && (
					<Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
				)}
				{sessions.error && !sessions.data && (
					<QueryError
						message={sessions.error.message}
						onRetry={() => void sessions.refetch()}
					/>
				)}
				{sessions.data?.map((session) => {
					const device = describeAgent(session.userAgent)
					const Icon = device.mobile ? Smartphone : Laptop
					const isCurrent = session.id === currentId
					const revoking = busy === session.id
					const menuItems = !isCurrent ? (
						<DropdownMenuItem
							disabled={revoking}
							onClick={() => void revoke(session)}
						>
							<LogOut /> Logout
						</DropdownMenuItem>
					) : null
					return (
						<WithContextMenu key={session.id} menu={menuItems}>
							<div className="flex items-center gap-3 rounded-md px-2 py-2 text-sm">
							<Icon className="size-5 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2 font-medium">
									{device.label}
									{isCurrent && (
										<Badge variant="secondary">
											This device
										</Badge>
									)}
								</div>
								<div className="truncate text-xs text-muted-foreground">
									{[
										session.ipAddress,
										`active ${timeAgo(session.updatedAt)}`,
										`logged in ${timeAgo(session.createdAt)}`,
									]
										.filter(Boolean)
										.join(" · ")}
								</div>
							</div>
							{!isCurrent && (
								<Button
									variant="ghost"
									size="sm"
									disabled={revoking}
									onClick={() => void revoke(session)}
								>
									{revoking && (
										<Loader2 className="animate-spin" />
									)}{" "}
									Logout
								</Button>
							)}
						</div>
						</WithContextMenu>
					)
				})}
			</CardContent>
		</Card>
	)
}

/** "Chrome on Windows" from a user-agent string (good enough to recognise your own devices). */
function describeAgent(ua: string | null | undefined) {
	if (!ua) {
		return { label: "Unknown device", mobile: false }
	}
	const browser = /edg\//i.test(ua)
		? "Edge"
		: /opr\/|opera/i.test(ua)
			? "Opera"
			: /firefox|fxios/i.test(ua)
				? "Firefox"
				: /chrome|crios/i.test(ua)
					? "Chrome"
					: /safari/i.test(ua)
						? "Safari"
						: "Browser"
	const os = /iphone|ipad|ipod/i.test(ua)
		? "iOS"
		: /android/i.test(ua)
			? "Android"
			: /windows/i.test(ua)
				? "Windows"
				: /mac os x|macintosh/i.test(ua)
					? "macOS"
					: /linux/i.test(ua)
						? "Linux"
						: null
	return {
		label: os ? `${browser} on ${os}` : browser,
		mobile: /mobile|iphone|android/i.test(ua),
	}
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
function timeAgo(date: Date | string) {
	const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000)
	if (mins < 1) {
		return "just now"
	}
	if (mins < 60) {
		return rtf.format(-mins, "minute")
	}
	const hours = Math.round(mins / 60)
	if (hours < 24) {
		return rtf.format(-hours, "hour")
	}
	return rtf.format(-Math.round(hours / 24), "day")
}
