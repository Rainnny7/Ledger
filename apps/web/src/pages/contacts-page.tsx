import { WithContextMenu } from "@/components/layout/app-context-menu"
import { copyText } from "@/lib/clipboard"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { confirmDialog } from "@/lib/confirm"
import {
	Check,
	Copy,
	Loader2,
	Pencil,
	Trash2,
	UserPlus,
	Users,
	X,
} from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { ContactAvatar } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Contact, type Shared } from "@/lib/api"
import { formatDate, localDate } from "@/lib/format"
import { useContacts, useGoals, useSubscriptions, useWork } from "@/lib/queries"

/** Your contacts: people you share goals, subscriptions and jobs with. */
export function ContactsPage() {
	const { data, loading, error, reload } = useContacts()
	const [query, setQuery] = useState("")
	const contacts = useMemo(() => data?.contacts ?? [], [data])
	const needle = query.trim().toLowerCase()
	const shown = needle
		? contacts.filter(
				(contact) =>
					contact.email.includes(needle) ||
					contact.name?.toLowerCase().includes(needle)
			)
		: contacts
	const sharedWith = useSharedCounts()

	return (
		<div className="grid gap-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Contacts
				</h1>
				<p className="text-sm text-muted-foreground">
					People you share with. Pick them when sharing a goal,
					subscription or job instead of typing their email each time.
				</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
				<AddContactCard />

				<Card>
					<CardHeader className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<CardTitle>Your contacts</CardTitle>
							<CardDescription>
								{contacts.length === 0
									? "No one yet."
									: `${contacts.length} ${contacts.length === 1 ? "person" : "people"}`}
							</CardDescription>
						</div>
						{contacts.length > 5 && (
							<Input
								className="w-full sm:w-56"
								placeholder="Search"
								value={query}
								onChange={(event) =>
									setQuery(event.target.value)
								}
								aria-label="Search contacts"
							/>
						)}
					</CardHeader>
					<CardContent>
						{error && !data && (
							<QueryError
								message={error.message}
								onRetry={() => void reload()}
							/>
						)}
						{!data && loading ? (
							<div className="grid gap-2">
								<Skeleton className="h-12 rounded-lg" />
								<Skeleton className="h-12 rounded-lg" />
							</div>
						) : contacts.length === 0 ? (
							<div className="flex flex-col items-center gap-3 py-8 text-center">
								<span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
									<Users className="size-6" />
								</span>
								<p className="max-w-xs text-sm text-muted-foreground">
									Add someone here, or share something with
									them and they’ll be added for you.
								</p>
							</div>
						) : shown.length === 0 ? (
							<p className="py-6 text-center text-sm text-muted-foreground">
								No contacts match “{query}”.
							</p>
						) : (
							<ul className="divide-y">
								{shown.map((contact) => (
									<ContactRow
										key={contact.id}
										contact={contact}
										sharing={
											sharedWith.get(contact.email) ?? 0
										}
									/>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

/** How many of your items each email has access to. */
function useSharedCounts() {
	const goals = useGoals().data?.goals
	const subs = useSubscriptions().data?.subscriptions
	const jobs = useWork().data?.jobs
	return useMemo(() => {
		const counts = new Map<string, number>()
		const all: Shared[] = [
			...(goals ?? []),
			...(subs ?? []),
			...(jobs ?? []),
		]
		for (const item of all) {
			for (const share of item.sharedWith) {
				counts.set(share.email, (counts.get(share.email) ?? 0) + 1)
			}
		}
		return counts
	}, [goals, subs, jobs])
}

function AddContactCard() {
	const [email, setEmail] = useState("")
	const [name, setName] = useState("")
	const [saving, setSaving] = useState(false)

	async function add(event: FormEvent) {
		event.preventDefault()
		setSaving(true)
		try {
			await api.addContact({
				email: email.trim(),
				name: name.trim() || null,
			})
			toast.success(`Added ${name.trim() || email.trim()}`)
			setEmail("")
			setName("")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Add a contact</CardTitle>
				<CardDescription>
					They’ll need a Ledger account on this server to see what you
					share.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={add} className="grid gap-3">
					<div className="grid gap-1.5">
						<Label htmlFor="contact-email">Email</Label>
						<Input
							id="contact-email"
							type="email"
							required
							autoComplete="off"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							placeholder="name@example.com"
						/>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor="contact-name">
							Name{" "}
							<span className="font-normal text-muted-foreground">
								(optional)
							</span>
						</Label>
						<Input
							id="contact-name"
							autoComplete="off"
							maxLength={80}
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Alex"
						/>
					</div>
					<Button
						type="submit"
						disabled={saving || !email.trim()}
						className="w-fit"
					>
						{saving ? (
							<Loader2 className="animate-spin" />
						) : (
							<UserPlus />
						)}{" "}
						Add contact
					</Button>
				</form>
			</CardContent>
		</Card>
	)
}

function ContactRow({
	contact,
	sharing,
}: {
	contact: Contact
	sharing: number
}) {
	const [editing, setEditing] = useState(false)
	const [name, setName] = useState(contact.name ?? "")

	async function save(event: FormEvent) {
		event.preventDefault()
		try {
			await api.updateContact(contact.id, {
				name: name.trim() || null,
			})
			setEditing(false)
		} catch (error) {
			toastError((error as Error).message)
		}
	}

	async function remove() {
		const extra =
			sharing > 0
				? ` You'll keep sharing ${sharing} item${sharing === 1 ? "" : "s"} with them; stop that from each item's Share menu.`
				: ""
		if (
			!(await confirmDialog({
				title: `Remove ${contact.name || contact.email} from your contacts?`,
				description: extra.trim() || undefined,
				action: "Remove",
				destructive: true,
			}))
		) {
			return
		}
		try {
			await api.deleteContact(contact.id)
			toast.success("Contact removed")
		} catch (error) {
			toastError((error as Error).message)
		}
	}

	function rename() {
		setName(contact.name ?? "")
		setEditing(true)
	}

	const menuItems = (
		<>
			<DropdownMenuItem onClick={rename}>
				<Pencil /> Rename
			</DropdownMenuItem>
			<DropdownMenuItem
				onClick={() => void copyText(contact.email, "Email")}
			>
				<Copy /> Copy email
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				variant="destructive"
				onClick={() => void remove()}
			>
				<Trash2 /> Remove
			</DropdownMenuItem>
		</>
	)

	return (
		<WithContextMenu menu={!editing && menuItems}>
			<li className="group flex items-center gap-3 py-3">
				<ContactAvatar contact={contact} className="size-9 text-xs" />
				{editing ? (
					<form
						onSubmit={save}
						className="flex min-w-0 flex-1 items-center gap-2"
					>
						<Input
							autoFocus
							value={name}
							maxLength={80}
							placeholder="Name"
							aria-label={`Name for ${contact.email}`}
							onChange={(event) => setName(event.target.value)}
							onKeyDown={(event) =>
								event.key === "Escape" && setEditing(false)
							}
						/>
						<Button
							type="submit"
							size="icon-sm"
							aria-label="Save name"
						>
							<Check />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Cancel"
							onClick={() => setEditing(false)}
						>
							<X />
						</Button>
					</form>
				) : (
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">
							{contact.name || contact.email}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{contact.name ? `${contact.email} · ` : ""}
							{sharing > 0
								? `Sharing ${sharing} ${sharing === 1 ? "item" : "items"}`
								: `Added ${formatDate(localDate(contact.createdAt))}`}
						</p>
					</div>
				)}
				{!editing && (
					<div className="flex shrink-0 gap-1 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Rename ${contact.email}`}
							onClick={rename}
						>
							<Pencil />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove ${contact.email}`}
							onClick={() => void remove()}
						>
							<Trash2 />
						</Button>
					</div>
				)}
			</li>
		</WithContextMenu>
	)
}
