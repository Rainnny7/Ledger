import { useQuery } from "@tanstack/react-query"
import { PencilIcon } from "@/components/icons/pencil"
import { EyeIcon } from "@/components/icons/eye"
import { UserPlusIcon } from "@/components/icons/user-plus"
import { Loader2, Users, X } from "lucide-react"
import { type FormEvent, type KeyboardEvent, useId, useState } from "react"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { QueryError } from "@/components/ui/query-error"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import {
	api,
	type Shared,
	type ShareKind,
	type SharePermission,
} from "@/lib/api"
import { useContacts } from "@/lib/queries"
import { initials, KIND_LABEL, shortName } from "@/lib/sharing"
import { cn } from "cn"

const PERMISSION_ITEMS = [
	{ value: "view", label: "Can view" },
	{ value: "edit", label: "Can edit" },
]

async function updateSharePermission(id: string, permission: SharePermission) {
	try {
		await api.updateShare(id, permission)
	} catch (error) {
		toastError((error as Error).message)
	}
}

async function removeShare(id: string, who: string) {
	try {
		await api.unshare(id)
		toast.success(`Stopped sharing with ${who}`)
	} catch (error) {
		toastError((error as Error).message)
	}
}

function PermissionSelect({
	value,
	onChange,
	size = "sm",
}: {
	value: SharePermission
	onChange: (permission: SharePermission) => void
	size?: "sm" | "default"
}) {
	return (
		<Select
			items={PERMISSION_ITEMS}
			value={value}
			onValueChange={(permissionValue) =>
				permissionValue && onChange(permissionValue as SharePermission)
			}
		>
			<SelectTrigger size={size} className="w-28" aria-label="Permission">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{PERMISSION_ITEMS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

/** Email field that suggests your contacts as you type. */
export function ContactPicker({
	value,
	onChange,
	exclude = [],
	id,
}: {
	value: string
	onChange: (email: string) => void
	exclude?: string[]
	id?: string
}) {
	const contacts = useContacts().data?.contacts ?? []
	const [focused, setFocused] = useState(false)
	// Suggestion picked with the arrow keys; focus stays in the input (aria-activedescendant).
	const [active, setActive] = useState(-1)
	const listId = useId()
	const query = value.trim().toLowerCase()
	const excluded = new Set(exclude)
	const matches = contacts
		.filter(
			(contact) => !excluded.has(contact.email) && contact.email !== query
		)
		.filter(
			(contact) =>
				!query ||
				contact.email.includes(query) ||
				contact.name?.toLowerCase().includes(query)
		)
		.slice(0, 6)
	const open = focused && matches.length > 0
	const current = open ? matches[active] : undefined
	const optionId = (contactId: string) => `${listId}-${contactId}`

	function pick(email: string) {
		onChange(email)
		setFocused(false)
		setActive(-1)
	}

	function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (!matches.length) {
			return
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault()
			setFocused(true)
			const step = event.key === "ArrowDown" ? 1 : -1
			setActive((i) =>
				i < 0 && step < 0
					? matches.length - 1
					: (i + step + matches.length) % matches.length
			)
		} else if (event.key === "Enter" && current) {
			event.preventDefault()
			pick(current.email)
		}
	}

	return (
		<div className="relative">
			<Input
				id={id}
				type="email"
				autoComplete="off"
				placeholder="name@example.com"
				value={value}
				onChange={(event) => {
					onChange(event.target.value)
					setActive(-1)
				}}
				onKeyDown={onKeyDown}
				onFocus={() => setFocused(true)}
				// Leave time for a click on a suggestion to land.
				onBlur={() => setTimeout(() => setFocused(false), 120)}
				role="combobox"
				aria-controls={listId}
				aria-expanded={open}
				aria-autocomplete="list"
				aria-activedescendant={
					current ? optionId(current.id) : undefined
				}
			/>
			{open && (
				<div
					id={listId}
					role="listbox"
					className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 animate-in overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md fade-in-0 zoom-in-95"
				>
					{/* Options aren't focusable: the input keeps focus and points at the active one. */}
					{matches.map((contact) => (
						<div
							key={contact.id}
							id={optionId(contact.id)}
							role="option"
							aria-selected={contact === current}
							className={cn(
								"flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
								contact === current && "bg-accent"
							)}
							// Keep focus in the input so the blur timer doesn't race the click.
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => pick(contact.email)}
							// Never focused (the input handles the keys); here for completeness.
							tabIndex={-1}
							onKeyDown={(event) =>
								event.key === "Enter" && pick(contact.email)
							}
						>
							<ContactAvatar contact={contact} />
							<span className="min-w-0 flex-1">
								{contact.name && (
									<span className="block truncate font-medium">
										{contact.name}
									</span>
								)}
								<span
									className={cn(
										"block truncate",
										contact.name &&
											"text-xs text-muted-foreground"
									)}
								>
									{contact.email}
								</span>
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

/** Initial-based avatar for a contact or share recipient. */
export function ContactAvatar({
	contact,
	className,
}: {
	contact: { name?: string | null; email: string }
	className?: string
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary",
				className
			)}
		>
			{initials(contact)}
		</span>
	)
}

/** Share one goal, subscription or job: who has it, and add someone by email or from your contacts. */
export function ShareDialog({
	kind,
	item,
	onClose,
}: {
	kind: ShareKind
	item: { id: string; name: string } | null
	onClose: () => void
}) {
	const shares = useQuery({
		queryKey: ["shares", kind, item?.id],
		queryFn: () => api.shares(kind, item!.id),
		enabled: !!item,
	})
	const [email, setEmail] = useState("")
	const [permission, setPermission] = useState<SharePermission>("view")
	const [saving, setSaving] = useState(false)
	const list = shares.data?.shares ?? []

	const close = () => {
		setEmail("")
		setPermission("view")
		onClose()
	}

	async function add(event: FormEvent) {
		event.preventDefault()
		if (!item || !email.trim()) {
			return
		}
		setSaving(true)
		try {
			await api.share(kind, item.id, { email: email.trim(), permission })
			toast.success(`Invitation sent for ${item.name}`, {
				description: `If an account uses ${email.trim()}, they’ll see the invitation and can accept it.`,
			})
			setEmail("")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={!!item} onOpenChange={(isOpen) => !isOpen && close()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Share {item?.name}</DialogTitle>
					<DialogDescription>
						People you invite see this {KIND_LABEL[kind]} in their
						own Ledger once they accept. Only you can delete it,
						delete its payments or change who it’s shared with.
					</DialogDescription>
				</DialogHeader>

				{shares.error && !shares.data && (
					<QueryError
						message={shares.error.message}
						onRetry={() => void shares.refetch()}
					/>
				)}

				<form onSubmit={add} className="grid gap-2">
					<Label htmlFor="share-email">Add someone</Label>
					<div className="flex gap-2">
						<div className="min-w-0 flex-1">
							<ContactPicker
								id="share-email"
								value={email}
								onChange={setEmail}
								exclude={list.map(
									(recipient) => recipient.email
								)}
							/>
						</div>
						<PermissionSelect
							value={permission}
							onChange={setPermission}
							size="default"
						/>
					</div>
					<div className="flex items-center justify-between gap-2">
						<Link
							to="/contacts"
							className="text-xs text-muted-foreground hover:text-foreground hover:underline"
							onClick={close}
						>
							Manage contacts
						</Link>
						<Button
							type="submit"
							size="sm"
							disabled={saving || !email.trim()}
						>
							{saving ? (
								<Loader2 className="animate-spin" />
							) : (
								<UserPlusIcon size={24} className="flex" />
							)}{" "}
							Invite
						</Button>
					</div>
				</form>

				<div className="grid gap-2">
					<h3 className="text-xs font-medium text-muted-foreground uppercase">
						People invited
					</h3>
					{shares.isLoading ? (
						<p className="text-sm text-muted-foreground">
							Loading…
						</p>
					) : list.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Just you, for now. Invitations to an email with no
							Ledger account won’t show up here.
						</p>
					) : (
						<ul className="grid gap-1">
							{list.map((recipient) => (
								<li
									key={recipient.id}
									className="flex items-center gap-2 rounded-lg px-1 py-1"
								>
									<ContactAvatar contact={recipient} />
									<span className="min-w-0 flex-1">
										{recipient.name && (
											<span className="block truncate text-sm font-medium">
												{recipient.name}
											</span>
										)}
										<span
											className={cn(
												"block truncate",
												recipient.name
													? "text-xs text-muted-foreground"
													: "text-sm"
											)}
										>
											{recipient.email}
										</span>
									</span>
									{recipient.status === "pending" && (
										<Badge
											variant="secondary"
											className="font-normal"
										>
											Pending
										</Badge>
									)}
									<PermissionSelect
										value={recipient.permission}
										onChange={(newPermission) =>
											void updateSharePermission(
												recipient.id,
												newPermission
											)
										}
									/>
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label={`Stop sharing with ${recipient.email}`}
										onClick={() =>
											void removeShare(
												recipient.id,
												recipient.name ||
													recipient.email
											)
										}
									>
										<X />
									</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

/**
 * A small pill on a card: "Shared · 2" on your own items, or who shared it and what you can do on
 * theirs.
 */
export function ShareBadge({
	item,
	onClick,
}: {
	item: Shared
	onClick?: () => void
}) {
	if (item.owner) {
		const Icon = item.access === "edit" ? PencilIcon : EyeIcon
		return (
			<Tooltip>
				<TooltipTrigger
					render={
						<Badge
							variant="secondary"
							className="shrink-0 gap-1 font-normal"
						/>
					}
				>
					<Icon className="size-3" /> {shortName(item.owner)}
				</TooltipTrigger>
				<TooltipContent>
					Shared by {item.owner.name || item.owner.email} ·{" "}
					{item.access === "edit" ? "you can edit" : "view only"}
				</TooltipContent>
			</Tooltip>
		)
	}
	const accepted = item.sharedWith.filter(
		(recipient) => recipient.status === "accepted"
	)
	if (accepted.length === 0) {
		return null
	}
	const names = accepted
		.map((recipient) => recipient.name || recipient.email)
		.join(", ")
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						type="button"
						onClick={onClick}
						className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/15"
					/>
				}
			>
				<Users className="size-3" /> {accepted.length}
			</TooltipTrigger>
			<TooltipContent>Shared with {names}</TooltipContent>
		</Tooltip>
	)
}
