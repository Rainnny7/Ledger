import {
	FileText,
	Loader2,
	LockKeyhole,
	ShieldCheck,
	Smartphone,
} from "lucide-react"
import { KeyRoundIcon } from "@/components/icons/key-round"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { InstitutionBadge } from "@/components/accounts/institution"
import { PROVIDERS, type ProviderId } from "@/components/accounts/providers"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { api, type SessionView } from "@/lib/api"
import { ChoiceButton, ChoiceIcon } from "./choice-button.tsx"
import type { Phase } from "./connect-types.ts"
import { PaypalFields } from "./paypal-fields.tsx"

/** React/UI entry: `ConnectPickScreen`. */
export function ConnectPickScreen({
	onUploadStatements,
	setProvider,
	setRemember,
	setPhase,
}: {
	onUploadStatements?: () => void
	setProvider: (provider: ProviderId) => void
	setRemember: (value: boolean) => void
	setPhase: (phase: Phase) => void
}) {
	return (
		<div className="grid gap-2">
			{(Object.keys(PROVIDERS) as ProviderId[]).map((id, i) => {
				const td = id === "td" && !!onUploadStatements
				return (
					<ChoiceButton
						key={id}
						index={i}
						icon={<InstitutionBadge institution={id} />}
						title={td ? "TD Bank" : PROVIDERS[id].label}
						description={
							td
								? "Log in with EasyWeb, or upload PDF statements"
								: PROVIDERS[id].blurb
						}
						onClick={() => {
							setProvider(id)
							setRemember(false)
							setPhase(
								td ? { type: "td-method" } : { type: "form" }
							)
						}}
					/>
				)
			})}
		</div>
	)
}

/** React/UI entry: `ConnectTdMethodScreen`. */
export function ConnectTdMethodScreen({
	onUploadStatements,
	setPhase,
}: {
	onUploadStatements?: () => void
	setPhase: (phase: Phase) => void
}) {
	return (
		<div className="grid gap-2">
			<ChoiceButton
				index={0}
				icon={
					<ChoiceIcon>
						<KeyRoundIcon size={16} className="flex" />
					</ChoiceIcon>
				}
				title="Log in with EasyWeb"
				description="Live balances and up to 18 months of transactions, refreshed automatically"
				onClick={() => setPhase({ type: "form" })}
			/>
			<ChoiceButton
				index={1}
				icon={
					<ChoiceIcon>
						<FileText className="size-4" />
					</ChoiceIcon>
				}
				title="Upload statements"
				description="PDF statements or a .zip from EasyWeb, for history past 18 months. No login needed"
				onClick={() => onUploadStatements?.()}
			/>
			<DialogFooter>
				<Button
					type="button"
					variant="ghost"
					onClick={() => setPhase({ type: "pick" })}
				>
					Back
				</Button>
			</DialogFooter>
		</div>
	)
}

/** React/UI entry: `ConnectFormScreen`. */
export function ConnectFormScreen({
	phase,
	provider,
	resync,
	busy,
	username,
	setUsername,
	password,
	setPassword,
	remember,
	setRemember,
	onUploadStatements,
	setPhase,
	start,
	connectionId,
	full,
}: {
	phase: Extract<Phase, { type: "form" }>
	provider: ProviderId
	resync: boolean
	busy: boolean
	username: string
	setUsername: (value: string) => void
	password: string
	setPassword: (value: string) => void
	remember: boolean
	setRemember: (value: boolean) => void
	onUploadStatements?: () => void
	setPhase: (phase: Phase) => void
	start: (
		provider: ProviderId,
		body: Parameters<typeof api.connect>[1]
	) => void
	connectionId?: string
	full: boolean
}) {
	return (
		<form
			className="grid animate-in gap-4 duration-200 fade-in-0"
			onSubmit={(event) => {
				event.preventDefault()
				void start(provider, {
					username,
					password,
					remember,
					connectionId,
					full,
				})
			}}
		>
			{phase.error && (
				<Alert variant="destructive">
					<AlertDescription>{phase.error}</AlertDescription>
				</Alert>
			)}
			{provider === "paypal" ? (
				<PaypalFields
					{...{ username, setUsername, password, setPassword }}
				/>
			) : (
				<>
					<div className="grid gap-2">
						<Label htmlFor="td-username">
							Username or Access Card
						</Label>
						<Input
							id="td-username"
							autoComplete="off"
							value={username}
							onChange={(event) =>
								setUsername(event.target.value)
							}
							required
							autoFocus
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="td-password">Password</Label>
						<Input
							id="td-password"
							type="password"
							autoComplete="off"
							value={password}
							onChange={(event) =>
								setPassword(event.target.value)
							}
							required
						/>
					</div>
					<label className="flex cursor-pointer items-start gap-2.5 text-sm">
						<Checkbox
							checked={remember}
							onCheckedChange={(value) =>
								setRemember(value === true)
							}
							className="mt-0.5"
						/>
						<span>
							Save credentials for one-click refresh
							<span className="block text-xs text-muted-foreground">
								Encrypted with AES-256-GCM on this server.
							</span>
						</span>
					</label>
					<p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
						<LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
						Your credentials are sent only to your own server, which
						signs in to easyweb.td.com in a private browser. TD may
						ask you to verify with a code.
					</p>
				</>
			)}
			<DialogFooter>
				{!resync && (
					<Button
						type="button"
						variant="ghost"
						onClick={() =>
							setPhase(
								provider === "td" && onUploadStatements
									? { type: "td-method" }
									: { type: "pick" }
							)
						}
					>
						Back
					</Button>
				)}
				<Button type="submit" disabled={busy || !username || !password}>
					{busy && <Loader2 className="animate-spin" />}
					Connect
				</Button>
			</DialogFooter>
		</form>
	)
}

/** React/UI entry: `ConnectSyncingScreen`. */
export function ConnectSyncingScreen({
	phase,
	historyLabel,
}: {
	phase:
		| Extract<Phase, { type: "syncing" }>
		| Extract<Phase, { type: "success" }>
	historyLabel: string
}) {
	return (
		<div className="flex animate-in flex-col items-center gap-3 py-8 text-center fade-in-0 zoom-in-95">
			<Loader2 className="size-8 animate-spin text-muted-foreground" />
			<p className="text-sm font-medium">
				{phase.type === "syncing" ? phase.message : "Logged in…"}
			</p>
			<p className="max-w-xs text-xs text-muted-foreground">
				The first sync reads {historyLabel} of history and can take a
				few minutes. Please keep this window open.
			</p>
		</div>
	)
}

/** React/UI entry: `ConnectMfaSelectScreen`. */
export function ConnectMfaSelectScreen({
	phase,
	sessionId,
	busy,
	mfaChoice,
	setMfaChoice,
	call,
}: {
	phase: Extract<Phase, { type: "mfa_select" }>
	sessionId: string
	busy: boolean
	mfaChoice: string
	setMfaChoice: (value: string) => void
	call: (fn: () => Promise<SessionView>) => void
}) {
	return (
		<form
			className="grid animate-in gap-4 duration-200 fade-in-0"
			onSubmit={(event) => {
				event.preventDefault()
				void call(() => api.chooseMfa(sessionId, mfaChoice))
			}}
		>
			<div className="flex items-start gap-2 text-sm">
				<ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
				<p>
					{phase.prompt ||
						"Your bank wants to verify it’s you. How should they send your security code?"}
				</p>
			</div>
			<RadioGroup
				value={mfaChoice}
				onValueChange={(value) => setMfaChoice(String(value))}
			>
				{phase.options.map((option) => (
					<label
						key={option.id}
						className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/60 has-data-checked:border-primary has-data-checked:bg-muted"
					>
						<RadioGroupItem value={option.id} />
						{option.label}
					</label>
				))}
			</RadioGroup>
			<DialogFooter>
				<Button type="submit" disabled={busy || !mfaChoice}>
					{busy && <Loader2 className="animate-spin" />}
					Send code
				</Button>
			</DialogFooter>
		</form>
	)
}

/** React/UI entry: `ConnectMfaCodeScreen`. */
export function ConnectMfaCodeScreen({
	phase,
	sessionId,
	busy,
	code,
	setCode,
	call,
}: {
	phase: Extract<Phase, { type: "mfa_code" }>
	sessionId: string
	busy: boolean
	code: string
	setCode: (value: string) => void
	call: (fn: () => Promise<SessionView>) => void
}) {
	return (
		<form
			className="grid animate-in gap-4 duration-200 fade-in-0"
			onSubmit={(event) => {
				event.preventDefault()
				void call(() => api.submitCode(sessionId, code))
			}}
		>
			<div className="flex items-start gap-2 text-sm">
				<ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
				<p>{phase.prompt}</p>
			</div>
			<div className="grid justify-center gap-2">
				<Label htmlFor="bank-code" className="sr-only">
					Security code
				</Label>
				<InputOTP
					id="bank-code"
					maxLength={6}
					pattern={REGEXP_ONLY_DIGITS}
					autoComplete="one-time-code"
					value={code}
					onChange={setCode}
					onComplete={(completedCode: string) => {
						if (!busy) {
							void call(() =>
								api.submitCode(sessionId, completedCode)
							)
						}
					}}
					disabled={busy}
					autoFocus
				>
					<InputOTPGroup className="*:data-[slot=input-otp-slot]:size-11 *:data-[slot=input-otp-slot]:text-lg">
						<InputOTPSlot index={0} />
						<InputOTPSlot index={1} />
						<InputOTPSlot index={2} />
					</InputOTPGroup>
					<InputOTPSeparator />
					<InputOTPGroup className="*:data-[slot=input-otp-slot]:size-11 *:data-[slot=input-otp-slot]:text-lg">
						<InputOTPSlot index={3} />
						<InputOTPSlot index={4} />
						<InputOTPSlot index={5} />
					</InputOTPGroup>
				</InputOTP>
			</div>
			<DialogFooter>
				<Button type="submit" disabled={busy || code.length < 6}>
					{busy && <Loader2 className="animate-spin" />}
					Verify
				</Button>
			</DialogFooter>
		</form>
	)
}

/** React/UI entry: `ConnectMfaPushScreen`. */
export function ConnectMfaPushScreen({
	phase,
}: {
	phase: Extract<Phase, { type: "mfa_push" }>
}) {
	return (
		<div className="flex animate-in flex-col items-center gap-3 py-8 text-center fade-in-0 zoom-in-95">
			<Smartphone className="size-8 animate-pulse text-primary" />
			<p className="text-sm font-medium">{phase.prompt}</p>
			<p className="flex items-center gap-2 text-xs text-muted-foreground">
				<Loader2 className="size-3 animate-spin" /> Waiting for
				approval…
			</p>
		</div>
	)
}
