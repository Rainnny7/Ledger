import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import { CheckIcon } from "@/components/icons/check"
import { CopyIcon } from "@/components/icons/copy"
import { FileTextIcon } from "@/components/icons/file-text"
import { KeyRoundIcon } from "@/components/icons/key-round"
import { PlusIcon } from "@/components/icons/plus"
import { Trash2Icon } from "@/components/icons/trash-2"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QueryError } from "@/components/ui/query-error"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { authClient } from "@/lib/auth-client"
import { copyText } from "@/lib/clipboard"
import { confirmDialog } from "@/lib/confirm"
import { toastError } from "@/lib/toast"

/** One of the user's keys as listed (the secret and its hash are never sent back after creation). */
interface ApiKeySummary {
	id: string
	name: string | null
	start: string | null
	createdAt: Date | string
	lastRequest: Date | string | null
	expiresAt: Date | string | null
}

/** A key that was just created: the only moment its secret is available. */
interface NewApiKey {
	name: string
	secret: string
}

const SECONDS_PER_DAY = 86_400

/** Expiry choices; `seconds: null` is a key that never expires. */
const EXPIRY_ITEMS = [
	{ value: "30", label: "30 days", seconds: 30 * SECONDS_PER_DAY },
	{ value: "90", label: "90 days", seconds: 90 * SECONDS_PER_DAY },
	{ value: "365", label: "1 year", seconds: 365 * SECONDS_PER_DAY },
	{ value: "never", label: "Never", seconds: null },
]

/** The read-only endpoints a key can call. */
const ENDPOINTS = [
	["GET /api/v1/accounts", "Accounts with balances"],
	[
		"GET /api/v1/transactions",
		"Transactions; filter with accountId, from, until, category, type, minAmount, maxAmount, search; page with limit (200 at most) and offset",
	],
	[
		"GET /api/v1/spending",
		"Spending and income totals; needs from and until, optional groupBy=category|merchant|month",
	],
	[
		"GET /api/v1/overview",
		"Balances, this and last month, budgets and subscriptions",
	],
]

/** Formats a stored date as a local date. */
function formatDate(value: Date | string): string {
	return new Date(value).toLocaleDateString()
}

/** A ready-to-run curl command for the transactions endpoint. */
function curlExample(secret: string): string {
	return `curl -H "Authorization: Bearer ${secret}" \\\n  "${window.location.origin}/api/v1/transactions?limit=10"`
}

/** Creates and deletes personal API keys that read your finances over HTTP (read-only, your data only). */
export function ApiKeysCard() {
	const keys = useQuery({
		queryKey: ["auth", "api-keys"],
		queryFn: async () => {
			const { data, error } = await authClient.apiKey.list()
			if (error) {
				throw new Error(error.message ?? "Could not load API keys")
			}
			return (data.apiKeys as ApiKeySummary[]).toSorted(
				(first, second) =>
					+new Date(second.createdAt) - +new Date(first.createdAt)
			)
		},
	})
	const [name, setName] = useState("")
	const [expiry, setExpiry] = useState("90")
	const [creating, setCreating] = useState(false)
	const [deleting, setDeleting] = useState<string | null>(null)
	const [created, setCreated] = useState<NewApiKey | null>(null)
	const { saved: createSaved, flash: flashCreate } = useSavedFlash()
	const { saved: deleteSaved, flash: flashDelete } = useSavedFlash()

	async function createKey(event: React.FormEvent) {
		event.preventDefault()
		setCreating(true)
		const seconds =
			EXPIRY_ITEMS.find((item) => item.value === expiry)?.seconds ?? null
		const { data, error } = await authClient.apiKey.create({
			name: name.trim(),
			expiresIn: seconds,
		})
		setCreating(false)
		if (error || !data) {
			toastError(error?.message ?? "Could not create the key")
			return
		}
		setCreated({ name: name.trim(), secret: data.key })
		setName("")
		flashCreate()
		void keys.refetch()
	}

	async function deleteKey(key: ApiKeySummary) {
		const confirmed = await confirmDialog({
			title: `Delete "${key.name}"?`,
			description:
				"Anything using this key loses access straight away. This can't be undone.",
			action: "Delete",
			destructive: true,
		})
		if (!confirmed) {
			return
		}
		setDeleting(key.id)
		const { error } = await authClient.apiKey.delete({ keyId: key.id })
		setDeleting(null)
		if (error) {
			toastError(error.message ?? "Could not delete the key")
		} else {
			toast.success("API key deleted")
			flashDelete()
		}
		void keys.refetch()
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					API Keys
					<SavedIndicator saved={deleteSaved} showLabel={false} />
				</CardTitle>
				<CardDescription>
					Read your accounts and transactions from scripts and other
					tools over HTTP. Keys are read-only, limited to your own
					data and to 60 requests a minute each.
				</CardDescription>
				<CardAction>
					<ApiUsageDialog />
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-4">
				<form
					onSubmit={(event) => void createKey(event)}
					className="flex flex-wrap items-end gap-2"
				>
					<div className="grid min-w-48 flex-1 gap-2">
						<Label htmlFor="api-key-name">Key Name</Label>
						<Input
							id="api-key-name"
							value={name}
							maxLength={60}
							placeholder="Budget spreadsheet"
							autoComplete="off"
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Expires</Label>
						<Select
							items={EXPIRY_ITEMS}
							value={expiry}
							onValueChange={(next) => {
								if (next) {
									setExpiry(next)
								}
							}}
						>
							<SelectTrigger className="w-32">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EXPIRY_ITEMS.map((item) => (
									<SelectItem
										key={item.value}
										value={item.value}
									>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex items-center gap-2">
						<SavedIndicator saved={createSaved} />
						<Button
							type="submit"
							disabled={creating || !name.trim()}
						>
						{creating ? (
							<Loader2 className="animate-spin" />
						) : (
							<PlusIcon size={24} className="flex" />
						)}{" "}
						Create key
					</Button>
					</div>
				</form>
				{keys.error && !keys.data && (
					<QueryError
						message={keys.error.message}
						onRetry={() => void keys.refetch()}
					/>
				)}
				{keys.data?.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No API keys yet.
					</p>
				)}
				<div className="grid gap-1">
					{keys.data?.map((key) => (
						<div
							key={key.id}
							className="flex items-center gap-3 rounded-md px-2 py-2 text-sm"
						>
							<KeyRoundIcon
								size={20}
								className="flex shrink-0 text-muted-foreground"
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">
									{key.name}
								</div>
								<div className="truncate text-xs text-muted-foreground">
									{[
										key.start
											? `starts with ${key.start}`
											: null,
										`created ${formatDate(key.createdAt)}`,
										key.lastRequest
											? `last used ${formatDate(key.lastRequest)}`
											: "never used",
										key.expiresAt
											? `expires ${formatDate(key.expiresAt)}`
											: "never expires",
									]
										.filter(Boolean)
										.join(" · ")}
								</div>
							</div>
							<Button
								variant="ghost"
								size="sm"
								disabled={deleting === key.id}
								onClick={() => void deleteKey(key)}
							>
								{deleting === key.id ? (
									<Loader2 className="animate-spin" />
								) : (
									<Trash2Icon size={24} className="flex" />
								)}{" "}
								Delete
							</Button>
						</div>
					))}
				</div>
			</CardContent>
			<NewKeyDialog created={created} onClose={() => setCreated(null)} />
		</Card>
	)
}

/** A button opening the API reference: a ready-to-run request and the endpoints a key can call. */
function ApiUsageDialog() {
	return (
		<Dialog>
			<DialogTrigger
				render={
					<Button variant="outline" size="sm">
						<FileTextIcon size={24} className="flex" /> How to use
					</Button>
				}
			/>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Using an API Key</DialogTitle>
					<DialogDescription>
						Send the key in the Authorization header. Every endpoint
						is read-only and returns JSON.
					</DialogDescription>
				</DialogHeader>
				<div className="grid min-w-0 gap-4 text-sm">
					<pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
						{curlExample("YOUR_KEY")}
					</pre>
					<ul className="grid gap-2 text-xs text-muted-foreground">
						{ENDPOINTS.map(([endpoint, description]) => (
							<li key={endpoint}>
								<code className="font-mono text-foreground">
									{endpoint}
								</code>{" "}
								{description}
							</li>
						))}
					</ul>
				</div>
			</DialogContent>
		</Dialog>
	)
}

/** Shows a new key once, with a copy button and a ready-to-run example. */
function NewKeyDialog({
	created,
	onClose,
}: {
	created: NewApiKey | null
	onClose: () => void
}) {
	const [copied, setCopied] = useState(false)
	return (
		<Dialog
			open={created !== null}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					setCopied(false)
					onClose()
				}
			}}
		>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>API Key Created</DialogTitle>
					<DialogDescription>
						Copy it now: for your security, "{created?.name}" can't
						be shown again.
					</DialogDescription>
				</DialogHeader>
				{created && (
					<div className="grid min-w-0 gap-4">
						<div className="grid gap-2">
							<Label htmlFor="api-key-secret">Key</Label>
							<div className="flex gap-2">
								<Input
									id="api-key-secret"
									readOnly
									value={created.secret}
									className="font-mono"
									onFocus={(event) => event.target.select()}
								/>
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										void copyText(created.secret, "Key")
										setCopied(true)
									}}
								>
									{copied ? (
										<CheckIcon size={24} className="flex" />
									) : (
										<CopyIcon size={24} className="flex" />
									)}{" "}
									Copy
								</Button>
							</div>
						</div>
						<pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
							{curlExample(created.secret)}
						</pre>
						<Alert>
							<AlertDescription>
								Treat this like a password. Anyone with it can
								read your finances until you delete it.
							</AlertDescription>
						</Alert>
					</div>
				)}
				<DialogFooter>
					<Button type="button" onClick={onClose}>
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
