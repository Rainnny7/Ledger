import { Loader2 } from "lucide-react"
import { PlusIcon } from "@/components/icons/plus"
import { Trash2Icon } from "@/components/icons/trash-2"
import { CopyIcon } from "@/components/icons/copy"
import { CheckIcon } from "@/components/icons/check"
import { KeyRoundIcon } from "@/components/icons/key-round"
import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Card,
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QueryError } from "@/components/ui/query-error"
import { api, type McpToken } from "@/lib/api"
import { copyText } from "@/lib/clipboard"
import { confirmDialog } from "@/lib/confirm"
import { useMcpTokens } from "@/lib/queries"
import { toastError } from "@/lib/toast"

/** A token that was just created: the only moment its secret is available. */
interface NewToken {
	name: string
	secret: string
}

/** The `claude mcp add` command and the `mcpServers` JSON for a freshly made token. */
function connectionSnippets(secret: string) {
	const url = `${window.location.origin}/api/mcp`
	return {
		command: `claude mcp add --transport http ledger ${url} --header "Authorization: Bearer ${secret}"`,
		json: JSON.stringify(
			{
				mcpServers: {
					ledger: {
						type: "http",
						url,
						headers: { Authorization: `Bearer ${secret}` },
					},
				},
			},
			null,
			2
		),
	}
}

/** Formats a stored UTC `YYYY-MM-DD HH:MM:SS` timestamp as a local date. */
function formatStored(timestamp: string): string {
	return new Date(`${timestamp.replace(" ", "T")}Z`).toLocaleDateString()
}

/** Creates and revokes personal tokens that let MCP clients (Claude Desktop, Claude Code) read your finances. */
export function McpAccessCard() {
	const tokens = useMcpTokens(true)
	const [name, setName] = useState("")
	const [creating, setCreating] = useState(false)
	const [revoking, setRevoking] = useState<string | null>(null)
	const [created, setCreated] = useState<NewToken | null>(null)

	async function createToken(event: React.FormEvent) {
		event.preventDefault()
		setCreating(true)
		try {
			const result = await api.createMcpToken(name.trim())
			setCreated({ name: result.row.name, secret: result.token })
			setName("")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setCreating(false)
		}
	}

	async function revokeToken(token: McpToken) {
		const confirmed = await confirmDialog({
			title: `Revoke "${token.name}"?`,
			description:
				"Anything using this token loses access straight away. This can't be undone.",
			action: "Revoke",
			destructive: true,
		})
		if (!confirmed) {
			return
		}
		setRevoking(token.id)
		try {
			await api.revokeMcpToken(token.id)
			toast.success("Token revoked")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setRevoking(null)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>MCP access</CardTitle>
				<CardDescription>
					Connect Claude Desktop, Claude Code or another MCP client to
					your finances with a personal token. Access is read-only and
					limited to your own data; the client you connect sees
					whatever its tools return.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<form
					onSubmit={(event) => void createToken(event)}
					className="flex items-end gap-2"
				>
					<div className="grid flex-1 gap-2">
						<Label htmlFor="mcp-token-name">Token name</Label>
						<Input
							id="mcp-token-name"
							value={name}
							maxLength={60}
							placeholder="Claude Desktop on my laptop"
							autoComplete="off"
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<Button type="submit" disabled={creating || !name.trim()}>
						{creating ? (
							<Loader2 className="animate-spin" />
						) : (
							<PlusIcon size={24} className="flex" />
						)}{" "}
						Create token
					</Button>
				</form>
				{tokens.error && !tokens.data && (
					<QueryError
						message={tokens.error.message}
						onRetry={() => void tokens.reload()}
					/>
				)}
				{tokens.data?.tokens.length === 0 && (
					<p className="text-sm text-muted-foreground">
						No tokens yet.
					</p>
				)}
				<div className="grid gap-1">
					{tokens.data?.tokens.map((token) => (
						<div
							key={token.id}
							className="flex items-center gap-3 rounded-md px-2 py-2 text-sm"
						>
							<KeyRoundIcon
								size={20}
								className="flex shrink-0 text-muted-foreground"
							/>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">
									{token.name}
								</div>
								<div className="truncate text-xs text-muted-foreground">
									{[
										`ends in ${token.lastFour}`,
										`created ${formatStored(token.createdAt)}`,
										token.lastUsedAt
											? `last used ${formatStored(token.lastUsedAt)}`
											: "never used",
									].join(" · ")}
								</div>
							</div>
							<div>
								<Button
									variant="ghost"
									size="sm"
									disabled={revoking === token.id}
									onClick={() => void revokeToken(token)}
								>
									{revoking === token.id ? (
										<Loader2 className="animate-spin" />
									) : (
										<Trash2Icon
											size={24}
											className="flex"
										/>
									)}{" "}
									Revoke
								</Button>
							</div>
						</div>
					))}
				</div>
			</CardContent>
			<NewTokenDialog token={created} onClose={() => setCreated(null)} />
		</Card>
	)
}

/** Shows a new token once, with copy buttons and ready-to-paste client configuration. */
function NewTokenDialog({
	token,
	onClose,
}: {
	token: NewToken | null
	onClose: () => void
}) {
	const [copied, setCopied] = useState(false)
	const snippets = token ? connectionSnippets(token.secret) : null

	return (
		<Dialog
			open={token !== null}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					setCopied(false)
					onClose()
				}
			}}
		>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Token created</DialogTitle>
					<DialogDescription>
						Copy it now: for your security, "{token?.name}" can't be
						shown again.
					</DialogDescription>
				</DialogHeader>
				{token && snippets && (
					<div className="grid min-w-0 gap-4">
						<div className="grid gap-2">
							<Label htmlFor="mcp-token-secret">Token</Label>
							<div className="flex gap-2">
								<Input
									id="mcp-token-secret"
									readOnly
									value={token.secret}
									className="font-mono"
									onFocus={(event) => event.target.select()}
								/>
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										void copyText(token.secret, "Token")
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
						<Snippet label="Claude Code" text={snippets.command} />
						<Snippet
							label="Claude Desktop and other clients (JSON)"
							text={snippets.json}
						/>
						<Alert>
							<AlertDescription>
								Treat this like a password. Anyone with it can
								read your finances until you revoke it.
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

/** A copyable block of configuration text. */
function Snippet({ label, text }: { label: string; text: string }) {
	return (
		<div className="grid min-w-0 gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-sm font-medium">{label}</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => void copyText(text, label)}
				>
					<CopyIcon size={24} className="flex" /> Copy
				</Button>
			</div>
			<pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
				{text}
			</pre>
		</div>
	)
}
