import { confirmDialog } from "@/lib/confirm"
import { useEffect, useMemo, useRef, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import type { PaymentDraft } from "@/components/goals/goal-form"
import { byUrgency } from "@/components/goals/goal-sort"
import { leaveShared, splitShared } from "@/lib/sharing"
import { api, type Goal, type GoalInput } from "@/lib/api"
import { isoDate } from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useGoals } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"

async function removeGoal(goal: Goal) {
	if (
		!(await confirmDialog({
			title: `Delete “${goal.name}”?`,
			description: `Its ${goal.payments.length} payment${goal.payments.length === 1 ? "" : "s"} are deleted too. This can’t be undone.`,
			action: "Delete goal",
			destructive: true,
		}))
	) {
		return
	}
	try {
		await api.deleteGoal(goal.id)
		toast.success("Goal deleted")
	} catch (error) {
		toastError((error as Error).message)
	}
}

async function setGoalArchived(goal: Goal, value: boolean) {
	try {
		await api.updateGoal(goal.id, { archived: value })
		toast.success(value ? `${goal.name} archived` : `${goal.name} restored`)
	} catch (error) {
		toastError((error as Error).message)
	}
}

/** State and handlers for goals page. */
export function useGoalsPage() {
	const { data, loading, error, reload } = useGoals()
	const [creating, setCreating] = useState<Partial<GoalInput> | null>(null)
	const [editing, setEditing] = useState<Goal | null>(null)
	const [paying, setPaying] = useState<PaymentDraft | null>(null)
	const [showArchived, setShowArchived] = useState(false)
	const [sharing, setSharing] = useState<Goal | null>(null)

	const [focusParam] = useQueryState("focus", parseAsString.withDefault(""))
	const scrolledTo = useRef("")
	useEffect(() => {
		if (!focusParam || !data || scrolledTo.current === focusParam) {
			return
		}
		const element = document.querySelector('[data-focused="true"]')
		if (!element) {
			return
		}
		scrolledTo.current = focusParam
		element.scrollIntoView({ block: "center", behavior: "smooth" })
	}, [focusParam, data])

	const { own: goals, shared } = useMemo(
		() => splitShared(data?.goals ?? []),
		[data]
	)
	const sharedOpen = shared
		.filter((goal) => !goal.archived)
		.toSorted(byUrgency)
	const open = useMemo(
		() =>
			goals
				.filter((goal) => !goal.archived && goal.status !== "done")
				.toSorted(byUrgency),
		[goals]
	)
	const reached = goals.filter(
		(goal) => !goal.archived && goal.status === "done"
	)
	const archived = goals.filter((goal) => goal.archived)

	const fx = useConverter()
	const saved = fx.sum(open.map((goal) => [goal.saved, goal.currency]))
	const remaining = fx.sum(
		open.map((goal) => [goal.remaining, goal.currency])
	)
	const perMonth = fx.sum(
		open.map((goal) => [goal.neededPerMonth ?? 0, goal.currency])
	)
	const thisMonth = useMemo(() => {
		const prefix = isoDate().slice(0, 7)
		return fx.sum(
			goals.flatMap((goal) =>
				goal.payments
					.filter((payment) => payment.date.startsWith(prefix))
					.map((payment) => [payment.amount, goal.currency] as const)
			)
		)
	}, [goals, fx])

	const startNew = (preset: Partial<GoalInput> = {}) => setCreating(preset)
	useIntent("new", () => startNew())

	const actions = {
		onPay: (goal: Goal) => setPaying({ goal }),
		onEdit: setEditing,
		onDelete: (goal: Goal) => void removeGoal(goal),
		onArchive: (goal: Goal) => void setGoalArchived(goal, !goal.archived),
		onShare: (goal: Goal) => setSharing(goal),
		onLeave: (goal: Goal) => void leaveShared("goal", goal),
	}

	return {
		data,
		loading,
		error,
		reload,
		creating,
		editing,
		paying,
		showArchived,
		setShowArchived,
		sharing,
		setSharing,
		goals,
		sharedOpen,
		open,
		reached,
		archived,
		saved,
		remaining,
		perMonth,
		thisMonth,
		startNew,
		actions,
		closeDialogs: () => {
			setCreating(null)
			setEditing(null)
		},
		closePaying: () => setPaying(null),
	}
}
