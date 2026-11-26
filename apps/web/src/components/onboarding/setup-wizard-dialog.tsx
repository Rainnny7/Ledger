import { useCallback, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import {
	AnimatePresence,
	domAnimation,
	LazyMotion,
	m,
	useReducedMotion,
} from "motion/react"
import type { Variants } from "motion/react"
import { ConnectFlowStandalone } from "@/components/accounts/connect/connect-flow"
import {
	AppearanceAccentPicker,
	AppearanceModePicker,
} from "@/components/settings/appearance-pickers"
import { CurrencyPreferenceField } from "@/components/settings/currency-preference-field"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { authClient, useSession } from "@/lib/auth-client"
import { demoMode, setDemoPrefs, useDemoPrefs } from "@/lib/demo"
import { queryClient, useOverview } from "@/lib/queries"
import { toastError } from "@/lib/toast"
import { cn } from "cn"

/** Every wizard step in order; "connect" is dropped for users who already have a bank linked. */
const ALL_WIZARD_STEPS = [
	"welcome",
	"money",
	"look",
	"connect",
	"done",
] as const

/** Ease-out with a long tail: the step arrives quickly and settles softly. */
const SETTLE_EASE = [0.22, 1, 0.36, 1] as const

/**
 * Step transition: the old step leaves fast (ease-in), the new one slides a short distance toward
 * the direction of travel with a slight blur that clears as it settles.
 */
const slideVariants: Variants = {
	enter: (direction: number) => ({
		opacity: 0,
		x: direction * 16,
		filter: "blur(2px)",
	}),
	center: {
		opacity: 1,
		x: 0,
		filter: "blur(0px)",
		transition: { duration: 0.16, ease: SETTLE_EASE },
	},
	exit: (direction: number) => ({
		opacity: 0,
		x: direction * -8,
		filter: "blur(2px)",
		transition: { duration: 0.07, ease: "easeIn" },
	}),
}

/** Reduced-motion fallback: a quick cross-fade with no movement. */
const fadeVariants: Variants = {
	enter: { opacity: 0 },
	center: { opacity: 1, transition: { duration: 0.12 } },
	exit: { opacity: 0, transition: { duration: 0.07 } },
}

type SetupWizardDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSkipSetup: () => void
	onTakeTour: () => void
	onGoToDashboard: () => void
}

/** Multi-step first-run setup: preferences, appearance, bank link, tour. */
export function SetupWizardDialog({
	open,
	onOpenChange,
	onSkipSetup,
	onTakeTour,
	onGoToDashboard,
}: SetupWizardDialogProps) {
	const [stepIndex, setStepIndex] = useState(0)
	const [bankConnected, setBankConnected] = useState(false)
	// 1 when moving forward, -1 when going back, so steps slide in from the matching side.
	const [direction, setDirection] = useState(1)
	const reduceMotion = useReducedMotion()
	const { data: overview } = useOverview()
	// Keep the connect step once it was used here, so linking an account mid-wizard doesn't yank it away.
	const hasExistingConnections =
		(overview?.connections.length ?? 0) > 0 && !bankConnected
	const steps = ALL_WIZARD_STEPS.filter(
		(wizardStep) => wizardStep !== "connect" || !hasExistingConnections
	)
	const currentIndex = Math.min(stepIndex, steps.length - 1)
	const step = steps[currentIndex]
	const isFirstStep = currentIndex === 0
	const connectStepActive = open && step === "connect"

	const goNext = useCallback(() => {
		setDirection(1)
		setStepIndex((current) => Math.min(current + 1, steps.length - 1))
	}, [steps.length])

	const goBack = useCallback(() => {
		setDirection(-1)
		setStepIndex((current) => Math.max(current - 1, 0))
	}, [])

	const handleOpenChange = (nextOpen: boolean) => {
		onOpenChange(nextOpen)
	}

	return (
		<Dialog
			open={open}
			onOpenChange={handleOpenChange}
			disablePointerDismissal
		>
			<DialogContent className="max-h-[min(90vh,44rem)] overflow-x-hidden overflow-y-auto sm:max-w-xl">
				<WizardStepper
					stepIndex={currentIndex}
					stepCount={steps.length}
				/>
				<LazyMotion features={domAnimation} strict>
					<AnimatePresence
						mode="wait"
						initial={false}
						custom={direction}
					>
						<m.div
							key={step}
							className="grid gap-4"
							custom={direction}
							variants={
								reduceMotion ? fadeVariants : slideVariants
							}
							initial="enter"
							animate="center"
							exit="exit"
						>
							{step === "welcome" && <WelcomeStep />}
							{step === "money" && <MoneyStep />}
							{step === "look" && <LookStep />}
							{step === "connect" && (
								<ConnectStep
									active={connectStepActive}
									bankConnected={bankConnected}
									onConnected={() => setBankConnected(true)}
									onLater={goNext}
								/>
							)}
							{step === "done" && <DoneStep />}
						</m.div>
					</AnimatePresence>
				</LazyMotion>

				{step !== "done" && (
					<DialogFooter className="gap-2 sm:justify-between">
						<Button
							type="button"
							variant="outline"
							disabled={isFirstStep}
							onClick={goBack}
						>
							Back
						</Button>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="ghost"
								onClick={onSkipSetup}
							>
								Skip setup
							</Button>
							<Button type="button" onClick={goNext}>
								Next
							</Button>
						</div>
					</DialogFooter>
				)}

				{step === "done" && (
					<DialogFooter className="gap-2 sm:justify-end">
						<Button
							type="button"
							variant="outline"
							onClick={onGoToDashboard}
						>
							Go to dashboard
						</Button>
						<Button type="button" onClick={onTakeTour}>
							Take the tour
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	)
}

function WizardStepper({
	stepIndex,
	stepCount,
}: {
	stepIndex: number
	stepCount: number
}) {
	const progress = ((stepIndex + 1) / stepCount) * 100
	return (
		<div className="grid gap-2 pb-2">
			<span className="text-xs text-muted-foreground">
				Step {stepIndex + 1} of {stepCount}
			</span>
			<div
				className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-valuenow={stepIndex + 1}
				aria-valuemin={1}
				aria-valuemax={stepCount}
			>
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-300"
					style={{ width: `${progress}%` }}
				/>
			</div>
			<div className="flex justify-between gap-1">
				{Array.from({ length: stepCount }, (_, index) => (
					<span
						key={index}
						className={cn(
							"size-2 rounded-full transition-colors",
							index <= stepIndex
								? "bg-primary"
								: "bg-muted-foreground/30"
						)}
						aria-hidden
					/>
				))}
			</div>
		</div>
	)
}

function WelcomeStep() {
	return (
		<DialogHeader>
			<DialogTitle>Welcome to Ledger</DialogTitle>
			<DialogDescription>
				Ledger brings your bank accounts, spending, and goals into one
				place. This short setup picks your currency and look, and can
				link your first account. You can change everything later in
				Settings.
			</DialogDescription>
		</DialogHeader>
	)
}

function MoneyStep() {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Money</DialogTitle>
				<DialogDescription>
					Choose how amounts are shown and whether overdraft counts
					toward balances.
				</DialogDescription>
			</DialogHeader>
			<div className="grid gap-6 py-2">
				<CurrencyPreferenceField idPrefix="onboarding" />
				<IncludeOverdraftField idPrefix="onboarding" />
			</div>
		</>
	)
}

function LookStep() {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Look</DialogTitle>
				<DialogDescription>
					Pick light or dark mode and an accent colour.
				</DialogDescription>
			</DialogHeader>
			<div className="grid gap-6 py-2">
				<AppearanceModePicker />
				<AppearanceAccentPicker />
			</div>
		</>
	)
}

function ConnectStep({
	active,
	bankConnected,
	onConnected,
	onLater,
}: {
	active: boolean
	bankConnected: boolean
	onConnected: () => void
	onLater: () => void
}) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Connect your first bank account</DialogTitle>
				<DialogDescription>
					Link TD EasyWeb or PayPal to pull balances and transactions
					into Ledger.
				</DialogDescription>
			</DialogHeader>
			{bankConnected ? (
				<div className="flex animate-in flex-col items-center gap-3 py-6 text-center fade-in-0">
					<CheckCircle2 className="size-10 text-primary" />
					<p className="text-sm font-medium">
						Bank account connected
					</p>
					<p className="max-w-sm text-xs text-muted-foreground">
						Your first sync may take a few minutes. You can keep
						going while it runs in the background.
					</p>
				</div>
			) : (
				<div className="py-2">
					<ConnectFlowStandalone
						open={active}
						closeOnSuccess={false}
						onConnected={() => onConnected()}
					/>
				</div>
			)}
			{!bankConnected && (
				<div className="flex justify-center pb-2">
					<Button type="button" variant="ghost" onClick={onLater}>
						I&apos;ll do this later
					</Button>
				</div>
			)}
		</>
	)
}

function DoneStep() {
	return (
		<DialogHeader>
			<DialogTitle>You&apos;re set up</DialogTitle>
			<DialogDescription>
				Explore the sidebar with a quick tour, or jump straight to your
				dashboard.
			</DialogDescription>
		</DialogHeader>
	)
}

/** Overdraft toggle for onboarding (same behaviour as settings preferences). */
function IncludeOverdraftField({ idPrefix }: { idPrefix: string }) {
	const { data } = useSession()
	const demo = useDemoPrefs()
	const saved =
		demo.includeOverdraft ??
		(data?.user as { includeOverdraft?: boolean | null } | undefined)
			?.includeOverdraft ??
		true
	const [pending, setPending] = useState<boolean | null>(null)
	const checked = pending ?? saved

	async function toggle(value: boolean) {
		if (demoMode) {
			return setDemoPrefs({ includeOverdraft: value })
		}
		setPending(value)
		const { error } = await authClient.updateUser({
			includeOverdraft: value,
		})
		if (error) {
			toastError(error.message ?? "Could not save that")
		} else {
			await queryClient.invalidateQueries()
		}
		setPending(null)
	}

	const fieldId = `${idPrefix}-overdraft`

	return (
		<div className="flex items-start justify-between gap-4">
			<Label htmlFor={fieldId} className="grid gap-1 font-normal">
				<span className="font-medium">
					Include overdraft in balances
				</span>
				<span className="text-sm text-muted-foreground">
					Count available overdraft in totals and charts, or show only
					what the bank reports.
				</span>
			</Label>
			<Switch
				id={fieldId}
				checked={checked}
				disabled={pending !== null}
				onCheckedChange={(nextChecked) => void toggle(nextChecked)}
			/>
		</div>
	)
}
