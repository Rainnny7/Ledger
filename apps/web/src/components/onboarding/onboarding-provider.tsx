import { SetupWizardDialog } from "@/components/onboarding/setup-wizard-dialog"
import { runOnboardingTour } from "@/components/onboarding/onboarding-tour"
import { authClient, useSession } from "@/lib/auth-client"
import { demoMode } from "@/lib/demo"
import { toastError } from "@/lib/toast"
import { useNavigate } from "@tanstack/react-router"
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react"

type OnboardingContextValue = {
	/** Opens setup at the welcome step; does not clear completion. */
	startOnboarding: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

/** Start or replay first-login onboarding from the account menu or settings. */
export function useOnboarding() {
	const context = useContext(OnboardingContext)
	if (!context) {
		throw new Error("useOnboarding must be used within OnboardingProvider")
	}
	return context
}

type OnboardingProviderProps = {
	children: ReactNode
}

/** Auto-starts onboarding for new users; exposes manual restart. */
export function OnboardingProvider({ children }: OnboardingProviderProps) {
	const { data, refetch } = useSession()
	const navigate = useNavigate()
	const [wizardOpen, setWizardOpen] = useState(false)
	const [wizardRunId, setWizardRunId] = useState(0)
	const autoStarted = useRef(false)
	const enteringTour = useRef(false)
	const tourRun = useRef<ReturnType<typeof runOnboardingTour> | null>(null)

	const completeOnboarding = useCallback(async () => {
		if (demoMode) {
			return
		}
		const { error } = await authClient.updateUser({
			onboardingCompletedAt: new Date(),
		})
		if (error) {
			toastError(error.message ?? "Could not save onboarding")
			return
		}
		await refetch()
	}, [refetch])

	const startTour = useCallback(() => {
		void navigate({ to: "/" })
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				tourRun.current?.destroy()
				tourRun.current = runOnboardingTour(() => {
					tourRun.current = null
					void completeOnboarding()
				})
			})
		})
	}, [completeOnboarding, navigate])

	const openWizard = useCallback(() => {
		setWizardRunId((runId) => runId + 1)
		setWizardOpen(true)
	}, [])

	const startOnboarding = openWizard

	useEffect(() => {
		if (autoStarted.current || !data?.user || demoMode) {
			return
		}
		if (data.user.mustChangePassword) {
			return
		}
		const completed = (
			data.user as { onboardingCompletedAt?: Date | string | null }
		).onboardingCompletedAt
		if (completed) {
			return
		}
		autoStarted.current = true
		queueMicrotask(() => {
			openWizard()
		})
	}, [data, openWizard])

	const handleWizardOpenChange = (open: boolean) => {
		setWizardOpen(open)
		if (!open && !enteringTour.current) {
			void completeOnboarding()
		}
		enteringTour.current = false
	}

	const handleSkipSetup = () => {
		setWizardOpen(false)
		void completeOnboarding()
	}

	const handleTakeTour = () => {
		enteringTour.current = true
		setWizardOpen(false)
		startTour()
	}

	const handleGoToDashboard = () => {
		setWizardOpen(false)
		void completeOnboarding()
	}

	return (
		<OnboardingContext.Provider value={{ startOnboarding }}>
			{children}
			<SetupWizardDialog
				key={wizardRunId}
				open={wizardOpen}
				onOpenChange={handleWizardOpenChange}
				onSkipSetup={handleSkipSetup}
				onTakeTour={handleTakeTour}
				onGoToDashboard={handleGoToDashboard}
			/>
		</OnboardingContext.Provider>
	)
}