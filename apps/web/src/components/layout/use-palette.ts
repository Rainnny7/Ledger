import {
	BriefcaseBusiness,
	FileText,
	Landmark,
	LogOut,
	Monitor,
	MonitorPlay,
	Moon,
	Palette,
	Receipt,
	RefreshCw,
	Rocket,
	Sun,
	Timer,
	Wallet,
} from "lucide-react"
import { toastGoodbye } from "@/lib/toast"
import { useEffect, useMemo, useRef, useState } from "react"
import { SearchIcon } from "@/components/icons/search"
import { useNavigate } from "@tanstack/react-router"
import {
	ACTIONS,
	GROUP_ORDER,
	PAGES,
	SUGGESTED,
	type PaletteGroup,
	type PaletteItem,
	cachedTransactions,
	merchantItem,
	merchantsOf,
	parseAmount,
	readRecent,
	remember,
	score,
} from "@/components/layout/command-palette-data"
import { signOut, useSession } from "@/lib/auth-client"
import { DEMO_PERSONAS, demoMode, demoPersona, setDemoMode } from "@/lib/demo"
import { ACCENTS, MODES, useAppTheme } from "@/lib/theme"
import { formatMoney, formatShortDate } from "@/lib/format"
import {
	queryClient,
	useAppConfig,
	useGoals,
	useInvoices,
	useOverview,
	useSubscriptions,
	useWork,
} from "@/lib/queries"
import { settingsPaletteItems } from "@/components/settings/settings-tabs"

/** Command palette state: searchable items, keyboard selection, and navigation/actions. */
export function usePalette({ onDone }: { onDone: () => void }) {
	const navigate = useNavigate()
	const { mode, accent, changeMode, changeAccent } = useAppTheme()
	const session = useSession().data
	const isAdmin = session?.user.role === "admin"
	const config = useAppConfig()
	const accounts = useOverview().data?.accounts
	const goals = useGoals().data?.goals
	const subscriptions = useSubscriptions().data?.subscriptions
	const invoices = useInvoices().data?.invoices
	const jobs = useWork().data?.jobs
	const [query, setQuery] = useState("")
	const [active, setActive] = useState(0)
	const listRef = useRef<HTMLDivElement>(null)
	const [transactions] = useState(cachedTransactions)
	const merchants = useMemo(() => merchantsOf(transactions), [transactions])
	const [recent] = useState(readRecent)

	// Commands that do something right here rather than going to account page.
	const commands = useMemo<PaletteItem[]>(() => {
		const list: Omit<PaletteItem, "group">[] = [
			...MODES.map((entry) => ({
				id: `c:mode-${entry.id}`,
				label: `${entry.label} mode`,
				icon: entry.dark ? Moon : Sun,
				run: () => void changeMode(entry.id),
				keywords: `appearance theme colour color ${entry.dark ? "dark night" : "light day"}`,
			})),
			{
				id: "c:mode-system",
				label: "Match System Mode",
				icon: Monitor,
				run: () => void changeMode("system"),
				keywords: "appearance theme auto",
			},
			...ACCENTS.map((entry) => ({
				id: `c:accent-${entry.id}`,
				label: `${entry.label} accent`,
				icon: Palette,
				run: () => void changeAccent(entry.id),
				keywords: "appearance theme colour color highlight",
			})),
			...(demoMode
				? [
						{
							id: "c:demo",
							label: "Exit Demo Mode",
							icon: MonitorPlay,
							run: () => setDemoMode(false),
							keywords: "sample data example",
						},
					]
				: []),
			...DEMO_PERSONAS.filter(
				(persona) => !demoMode || persona.id !== demoPersona.id
			).map((persona) => ({
				id: `c:demo-${persona.id}`,
				label: `${demoMode ? "Switch demo to" : "Try demo as"} ${persona.name} (${persona.label})`,
				icon: MonitorPlay,
				run: () => setDemoMode(true, persona.id),
				keywords: `demo sample data example persona ${persona.label} ${persona.blurb}`,
			})),
			{
				id: "c:signout",
				label: "Logout",
				icon: LogOut,
				keywords: "log out logout leave",
				run: async () => {
					await signOut()
					toastGoodbye()
					if (demoMode) {
						setDemoMode(false)
					}
					queryClient.clear()
					void navigate({ to: "/login", replace: true })
				},
			},
		]
		return list
			.filter(
				(command) =>
					command.id !== `c:mode-${mode}` &&
					command.id !== `c:accent-${accent}`
			)
			.map((command) => ({ ...command, group: "Actions" as const }))
	}, [mode, accent, changeMode, changeAccent, navigate])

	// Everything findable by name: pages, accounts and the things you've made.
	const pool = useMemo(() => {
		const pages = PAGES.filter(
			(page) => !(demoMode && page.to === "/contacts")
		)
		pages.push(
			...settingsPaletteItems({
				isAdmin,
				showMcp: Boolean(config?.mcp),
			})
		)
		const activeJobs = (jobs ?? []).filter(
			(job) => !job.archived && job.access !== "view"
		)
		const out: PaletteItem[] = [
			...ACTIONS,
			...activeJobs.map((job) => ({
				id: `log:${job.id}`,
				label: `Log hours for ${job.name}`,
				icon: Timer,
				group: "Actions" as const,
				keywords: "time shift track work",
				to: `/work?log=${job.id}`,
			})),
			...commands,
			...pages,
			...(accounts ?? []).map((account) => ({
				id: `acct:${account.id}`,
				label: account.name,
				hint: account.numberMasked ?? account.currency,
				icon: Landmark,
				group: "Accounts" as const,
				keywords: `account ${account.type ?? ""}`,
				to: `/accounts/${account.id}`,
			})),
			...(goals ?? [])
				.filter((goal) => !goal.archived)
				.map((goal) => ({
					id: `goal:${goal.id}`,
					label: goal.name,
					hint: `${Math.round(goal.progress * 100)}% of ${formatMoney(goal.target, goal.currency)}`,
					icon: Rocket,
					group: "Goals" as const,
					keywords: "goal saving",
					to: `/goals?focus=${goal.id}`,
				})),
			...(subscriptions ?? []).map((subscription) => ({
				id: `sub:${subscription.id}`,
				label: subscription.name,
				hint: `${formatMoney(subscription.amount, subscription.currency)} · next ${formatShortDate(subscription.nextDue)}`,
				icon: RefreshCw,
				group: "Subscriptions" as const,
				keywords: "subscription bill recurring",
				to: `/subscriptions?focus=${subscription.id}`,
			})),
			...(invoices ?? []).map((invoice) => ({
				id: `inv:${invoice.id}`,
				label: `Invoice ${invoice.number}${invoice.client.name ? ` · ${invoice.client.name}` : ""}`,
				hint:
					invoice.balance > 0 && invoice.status !== "draft"
						? `${formatMoney(invoice.balance, invoice.currency)} due`
						: formatMoney(invoice.total, invoice.currency),
				icon: FileText,
				group: "Invoices" as const,
				keywords: `invoice ${invoice.status} ${invoice.client.email}`,
				to: `/invoices/${invoice.id}`,
			})),
			...activeJobs.map((job) => ({
				id: `job:${job.id}`,
				label: job.name,
				hint:
					job.owed > 0
						? `${formatMoney(job.owed, job.currency)} owed`
						: undefined,
				icon: BriefcaseBusiness,
				group: "Work" as const,
				keywords: "job work client",
				to: "/work",
			})),
		]
		return out
	}, [
		accounts,
		goals,
		subscriptions,
		invoices,
		jobs,
		commands,
		isAdmin,
		config?.mcp,
	])

	const items = useMemo(() => {
		const raw = query.trim()
		// ">" narrows to actions, like in an editor.
		const actionsOnly = raw.startsWith(">")
		const text = actionsOnly ? raw.slice(1).trim() : raw
		const words = text.toLowerCase().split(/\s+/).filter(Boolean)
		const searchable = actionsOnly
			? pool.filter((item) => item.group === "Actions")
			: pool

		if (!words.length) {
			if (actionsOnly) {
				return searchable
			}
			const byId = new Map(pool.map((item) => [item.id, item]))
			const merchantById = (id: string) => {
				const name = id.slice(2)
				const merchant = merchants.find(
					(candidate) => candidate.name === name
				)
				return merchant ? merchantItem(merchant) : undefined
			}
			const recents = recent
				.map(
					(id) =>
						byId.get(id) ??
						(id.startsWith("merchant:")
							? merchantById(id)
							: undefined)
				)
				.filter((item): item is PaletteItem => !!item)
				.map((item) => ({ ...item, group: "Recent" as const }))
			const seen = new Set(recents.map((item) => item.id))
			const suggested = SUGGESTED.filter((id) => !seen.has(id))
				.map((id) => byId.get(id))
				.filter((item): item is PaletteItem => !!item)
				.map((item) => ({ ...item, group: "Suggested" as const }))
			const pages = pool.filter(
				(item) => item.group === "Pages" && !seen.has(item.id)
			)
			const accountItems = pool.filter(
				(item) => item.group === "Accounts" && !seen.has(item.id)
			)
			return [...recents, ...suggested, ...pages, ...accountItems]
		}

		const found = searchable
			.map((item) => ({ item, score: score(item, words) }))
			.filter((row) => row.score >= 0)
			.toSorted(
				(left, right) =>
					GROUP_ORDER.indexOf(left.item.group) -
						GROUP_ORDER.indexOf(right.item.group) ||
					left.score - right.score
			)
		// Long lists of goals or bills shouldn'transaction push everything else off the screen.
		const perGroup = new Map<PaletteGroup, number>()
		const capped = found
			.filter(({ item }) => {
				const count = (perGroup.get(item.group) ?? 0) + 1
				perGroup.set(item.group, count)
				return (
					item.group === "Actions" ||
					item.group === "Pages" ||
					count <= 5
				)
			})
			.map((row) => row.item)
		if (actionsOnly) {
			return capped
		}

		// Typing an amount finds the transactions for it.
		const amount = parseAmount(text)
		const currencyOf = new Map(
			(accounts ?? []).map((account) => [account.id, account.currency])
		)
		const txItems: PaletteItem[] = amount
			? transactions
					.filter((transaction) => {
						const abs = Math.abs(transaction.amount)
						return amount.exact
							? Math.abs(abs - amount.value) < 0.005
							: Math.floor(abs) === amount.value
					})
					.slice(0, 8)
					.map((transaction) => ({
						id: `tx:${transaction.id}`,
						label: transaction.merchant,
						hint: `${formatMoney(transaction.amount, currencyOf.get(transaction.accountId))} · ${formatShortDate(transaction.date)}`,
						icon: transaction.amount > 0 ? Wallet : Receipt,
						group: "Transactions" as const,
						to: `/transactions?period=all&tx=${transaction.id}`,
					}))
			: []
		const merchantItems = merchants
			.filter((merchant) =>
				words.every((word) =>
					merchant.name.toLowerCase().includes(word)
				)
			)
			.slice(0, 5)
			.map(merchantItem)
		const search: PaletteItem = {
			id: "search",
			label: `Search transactions for “${text}”`,
			icon: SearchIcon,
			group: "Search",
			to: `/transactions?q=${encodeURIComponent(text)}&period=all`,
		}
		return [...txItems, ...capped, ...merchantItems, search]
	}, [query, pool, merchants, transactions, accounts, recent])

	const current = Math.min(active, items.length - 1)

	useEffect(() => {
		listRef.current
			?.querySelector(`[data-index="${current}"]`)
			?.scrollIntoView({ block: "nearest" })
	}, [current])

	function go(item: PaletteItem | undefined) {
		if (!item) {
			return
		}
		remember(item.id)
		onDone()
		if (item.run) {
			item.run()
		} else if (item.to) {
			void navigate({ href: item.to })
		}
	}

	return {
		query,
		setQuery,
		active,
		setActive,
		listRef,
		items,
		current,
		go,
	}
}
