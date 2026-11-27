import { driver, type DriveStep, type Driver } from "driver.js"

const TOUR_STEP_DEFINITIONS: {
	element: string
	title: string
	description: string
}[] = [
	{
		element: '[data-tour="nav-bank-accounts"]',
		title: "Bank Accounts",
		description:
			"Your linked accounts, balances, and overdraft at a glance.",
	},
	{
		element: '[data-tour="nav-transactions"]',
		title: "Transactions",
		description: "Search and categorise spending across all accounts.",
	},
	{
		element: '[data-tour="nav-insights"]',
		title: "Insights",
		description: "Charts and trends built from your real activity.",
	},
	{
		element: '[data-tour="nav-subscriptions"]',
		title: "Subscriptions",
		description: "Recurring charges and renewal dates in one place.",
	},
	{
		element: '[data-tour="nav-goals"]',
		title: "Goals",
		description: "Save toward targets and track progress over time.",
	},
	{
		element: '[data-tour="nav-advisor"]',
		title: "Advisor",
		description: "Personalised tips based on how you spend and save.",
	},
	{
		element: '[data-tour="nav-work"]',
		title: "Work",
		description: "Log hours, bill clients, and track payments.",
	},
	{
		element: '[data-tour="nav-invoices"]',
		title: "Invoices",
		description: "Create, send, and follow up on invoices.",
	},
	{
		element: '[data-tour="nav-taxes"]',
		title: "Taxes",
		description: "Income and deductions, ready for your accountant.",
	},
	{
		element: '[data-tour="account-menu"]',
		title: "Account Menu",
		description:
			"Settings, appearance, and “Take the tour” to replay onboarding any time.",
	},
	{
		element: '[data-tour="dashboard-connect"]',
		title: "Connect an Account",
		description:
			"Link TD EasyWeb or PayPal to pull balances and transactions into Ledger.",
	},
]

function visibleTourSteps(): DriveStep[] {
	return TOUR_STEP_DEFINITIONS.filter((step) =>
		document.querySelector(step.element)
	).map((step) => ({
		element: step.element,
		popover: {
			title: step.title,
			description: step.description,
			side: "bottom",
			align: "start",
		},
	}))
}

export type OnboardingTourRun = {
	/** Stop the tour early (does not call onDone). */
	destroy: () => void
}

/**
 * Spotlight tour of the main nav and dashboard connect action.
 * Steps missing from the DOM (demo gates, narrow layout) are skipped.
 */
export function runOnboardingTour(onDone: () => void): OnboardingTourRun {
	const steps = visibleTourSteps()
	let instance: Driver | undefined
	if (steps.length === 0) {
		onDone()
		return { destroy: () => {} }
	}
	instance = driver({
		showProgress: true,
		animate: true,
		overlayColor: "rgb(0 0 0 / 0.55)",
		stagePadding: 6,
		stageRadius: 8,
		popoverClass: "ledger-driver-popover",
		nextBtnText: "Next",
		prevBtnText: "Back",
		doneBtnText: "Finish",
		steps,
		onDestroyed: () => {
			onDone()
		},
	})
	instance.drive()
	return {
		destroy: () => {
			instance?.destroy()
		},
	}
}
