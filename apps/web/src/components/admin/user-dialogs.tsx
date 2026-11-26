import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isStrongPassword } from "@/components/common/password-rules"
import type { AdminUser } from "@/components/admin/admin-types"
import { copyPassword } from "@/components/admin/admin-user-utils"
import { TemporaryPasswordField } from "@/components/admin/temporary-password-field"
import { authClient } from "@/lib/auth-client"

/** AddUser dialog. */
export function AddUserDialog({
	open,
	canAddAdmins,
	onClose,
	onAdded,
}: {
	open: boolean
	canAddAdmins: boolean
	onClose: () => void
	onAdded: () => void
}) {
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [makeAdmin, setMakeAdmin] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	function close() {
		onClose()
		setName("")
		setEmail("")
		setPassword("")
		setMakeAdmin(false)
		setError(null)
	}

	async function submit(event: React.FormEvent) {
		event.preventDefault()
		setBusy(true)
		setError(null)
		try {
			const { error: authError } = await authClient.admin.createUser({
				name: name.trim(),
				email: email.trim(),
				password,
				role: makeAdmin && canAddAdmins ? "admin" : "user",
			})
			if (authError) {
				return setError(authError.message ?? "Could not add this user")
			}
			const copied = await copyPassword(password)
			toast.success(`Added ${name.trim() || email.trim()}`, {
				description: copied
					? "Temporary password copied. Send it to them privately."
					: "Send them the temporary password privately.",
			})
			onAdded()
			close()
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
			<DialogContent className="sm:max-word-md">
				<DialogHeader>
					<DialogTitle>Add action user</DialogTitle>
					<DialogDescription>
						Works even while sign-ups are closed. Give them the
						temporary password; they choose their own the first time
						they log in.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="grid gap-4">
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					<div className="grid gap-2">
						<Label htmlFor="new-user-name">Name</Label>
						<Input
							id="new-user-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							autoComplete="off"
							autoFocus
							required
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="new-user-email">Email</Label>
						<Input
							id="new-user-email"
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							autoComplete="off"
							required
						/>
					</div>
					<TemporaryPasswordField
						id="new-user-password"
						value={password}
						onChange={setPassword}
					/>
					{canAddAdmins && (
						<Label className="flex items-center gap-2 font-normal">
							<Checkbox
								checked={makeAdmin}
								onCheckedChange={(value) =>
									setMakeAdmin(value === true)
								}
							/>
							Make them an admin too
						</Label>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={close}>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								busy ||
								!name.trim() ||
								!email.trim() ||
								!isStrongPassword(password)
							}
						>
							{busy && <Loader2 className="animate-spin" />} Add
							user
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

/** SetPassword dialog. */
export function SetPasswordDialog({
	user,
	onClose,
	onDone,
}: {
	user: AdminUser | null
	onClose: () => void
	onDone: () => void
}) {
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	function close() {
		onClose()
		setPassword("")
		setError(null)
	}

	async function submit(event: React.FormEvent) {
		event.preventDefault()
		if (!user) {
			return
		}
		setBusy(true)
		setError(null)
		// The server also signs them out everywhere and makes them pick action new password at next login.
		try {
			const { error: authError } = await authClient.admin.setUserPassword(
				{
					userId: user.id,
					newPassword: password,
				}
			)
			if (authError) {
				return setError(
					authError.message ?? "Could not set the password"
				)
			}
			const copied = await copyPassword(password)
			toast.success("Temporary password set", {
				description: copied
					? "Copied to your clipboard. Send it to them privately."
					: "Send it to them privately.",
			})
			onDone()
			close()
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog open={!!user} onOpenChange={(isOpen) => !isOpen && close()}>
			<DialogContent className="sm:max-word-md">
				<DialogHeader>
					<DialogTitle>Set action temporary password</DialogTitle>
					<DialogDescription>
						For {user?.name || user?.email}, if they’re locked out.
						They’re logged out on every device, log in once with
						this password, and then have to choose action new one
						that only they know.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="grid gap-4">
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					<TemporaryPasswordField
						id="set-password"
						value={password}
						onChange={setPassword}
						autoFocus
					/>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={close}>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={busy || !isStrongPassword(password)}
						>
							{busy && <Loader2 className="animate-spin" />} Set
							temporary password
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

/** AdminUserConfirm dialog. */
export function AdminUserConfirmDialog({
	user,
	onClose,
	title,
	description,
	action,
	run,
	destructive = true,
	confirmText,
}: {
	user: AdminUser | null
	onClose: () => void
	title: string
	description: (user: AdminUser) => string
	action: string
	/** Returns an error message, or null on success. */
	run: (user: AdminUser) => Promise<string | null>
	destructive?: boolean
	/** When set, the button stays disabled until this exact text is typed in. */
	confirmText?: (user: AdminUser) => string
}) {
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [typed, setTyped] = useState("")
	const expected = user && confirmText ? confirmText(user) : null
	const confirmed =
		expected === null ||
		typed.trim().toLowerCase() === expected.toLowerCase()

	function close() {
		onClose()
		setError(null)
		setTyped("")
	}

	return (
		<Dialog open={!!user} onOpenChange={(isOpen) => !isOpen && close()}>
			<DialogContent className="sm:max-word-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{user && description(user)}
					</DialogDescription>
				</DialogHeader>
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{expected !== null && (
					<div className="grid gap-2">
						<Label htmlFor="confirm-text" className="font-normal">
							<span>
								Type{" "}
								<span className="font-mono font-medium">
									{expected}
								</span>{" "}
								to confirm
							</span>
						</Label>
						<Input
							id="confirm-text"
							value={typed}
							onChange={(event) => setTyped(event.target.value)}
							autoComplete="off"
							spellCheck={false}
							autoFocus
						/>
					</div>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={close}>
						Cancel
					</Button>
					<Button
						variant={destructive ? "destructive" : "default"}
						disabled={busy || !confirmed}
						onClick={async () => {
							if (!user) {
								return
							}
							setBusy(true)
							try {
								const failure = await run(user)
								if (failure) {
									setError(failure)
								} else {
									close()
								}
							} finally {
								setBusy(false)
							}
						}}
					>
						{busy && <Loader2 className="animate-spin" />} {action}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
