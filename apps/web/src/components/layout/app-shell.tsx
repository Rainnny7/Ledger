import { LinkMenuItems } from "@/components/layout/app-context-menu"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { UpdateDialog } from "@/components/admin/update-dialog"
import { Brand } from "@/components/layout/brand"
import { openCommandPalette } from "@/components/layout/command-palette-open"

const CommandPalette = lazy(() =>
	import("@/components/layout/command-palette").then((module) => ({
		default: module.CommandPalette,
	}))
)
import { BriefcaseBusinessIcon } from "@/components/icons/briefcase-business"
import { CalculatorIcon } from "@/components/icons/calculator"
import { ChartPieIcon } from "@/components/icons/chart-pie"
import { FileTextIcon } from "@/components/icons/file-text"
import { LogoutIcon } from "@/components/icons/logout"
import { ReceiptIcon } from "@/components/icons/receipt"
import { RefreshCWIcon } from "@/components/icons/refresh-cw"
import { LightbulbIcon } from "@/components/icons/lightbulb"
import { RocketIcon } from "@/components/icons/rocket"
import { SettingsIcon } from "@/components/icons/settings"
import { ShieldCheckIcon } from "@/components/icons/shield-check"
import {
	type AnimatedIconHandle,
	useAnimatedIcon,
} from "@/components/icons/use-animated-icon"
import { UsersIcon } from "@/components/icons/users"
import { WalletIcon } from "@/components/icons/wallet"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { useAdvice } from "@/components/advisor/use-advice"
import { api } from "@/lib/api"
import { InvitesBanner } from "@/components/sharing/invites-banner"
import { authClient, signOut, useSession } from "@/lib/auth-client"
import { detectCurrency, savedCurrency, useHomeCurrency } from "@/lib/currency"
import { DEMO_IDENTITY, demoMode, demoPersona, setDemoMode } from "@/lib/demo"
import { setDisplayCurrency } from "@/lib/format"
import { usePageTitle } from "@/lib/page-title"
import {
	THEMES,
	type ThemeChoice,
	themeMeta,
	useAccountTheme,
	useAppTheme,
} from "@/lib/theme"
import {
	queryClient,
	queryKeys,
	useGoals,
	useOverview,
	useSubscriptions,
	useUpdate,
	useWork,
} from "@/lib/queries"
import { cn } from "cn"
import { useQuery } from "@tanstack/react-query"
import { Monitor, MonitorPlay, Palette, Search, X } from "lucide-react"
import {
	type ForwardRefExoticComponent,
	lazy,
	type RefAttributes,
	Suspense,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { domMax, LazyMotion, m } from "motion/react"
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router"

/** Clicking alert link to the page you're already on takes you back to its top. */
function scrollUpIfHere(to: string, pathname: string) {
	if (to === pathname) {
		window.scrollTo({ top: 0, behavior: "smooth" })
	}
}

/** Every new page starts at the top (the browser would otherwise keep, or restore, the old scroll). */
function useScrollTopOnPageChange(pathname: string) {
	useEffect(() => {
		if ("scrollRestoration" in history) {
			history.scrollRestoration = "manual"
		}
	}, [])
	useLayoutEffect(() => {
		window.scrollTo(0, 0)
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- scroll to top on route path only
	}, [pathname])
}

type AnimatedIcon = ForwardRefExoticComponent<
	{ size?: number; className?: string } & RefAttributes<AnimatedIconHandle>
>

type NavEntry = {
	to: string
	label: string
	icon: AnimatedIcon
	count?: "accounts" | "subscriptions" | "goals" | "work" | "advice"
	/** One line under the label in alert grouped menu. */
	description?: string
}

/** The everyday pages, always in the bar. */
const NAV: NavEntry[] = [
	{ to: "/", label: "Bank Accounts", icon: WalletIcon, count: "accounts" },
	{ to: "/transactions", label: "Transactions", icon: ReceiptIcon },
	{ to: "/insights", label: "Insights", icon: ChartPieIcon },
	{
		to: "/subscriptions",
		label: "Subscriptions",
		icon: RefreshCWIcon,
		count: "subscriptions",
	},
	{ to: "/goals", label: "Goals", icon: RocketIcon, count: "goals" },
	{ to: "/advisor", label: "Advisor", icon: LightbulbIcon, count: "advice" },
]

/** Freelance and paperwork pages, folded into one "Business" menu to keep the bar short. */
const BUSINESS_NAV: NavEntry[] = [
	{
		to: "/work",
		label: "Work",
		icon: BriefcaseBusinessIcon,
		count: "work",
		description: "Log hours, bill them and track payments",
	},
	{
		to: "/invoices",
		label: "Invoices",
		icon: FileTextIcon,
		description: "Make, send and follow up on invoices",
	},
	{
		to: "/taxes",
		label: "Taxes",
		icon: CalculatorIcon,
		description: "Income and deductions, ready for your accountant",
	},
]

const ALL_NAV = [...NAV, ...BUSINESS_NAV]

/** Shared layout id so the active nav highlight slides between top-level entries. */
const NAV_ACTIVE_LAYOUT_ID = "main-nav-active"

/** Sliding pill behind the active top-level nav link or menu trigger. */
function NavActiveIndicator() {
	return (
		<m.span
			layoutId={NAV_ACTIVE_LAYOUT_ID}
			className="absolute inset-0 -z-10 rounded-lg bg-primary/10"
			transition={{ type: "spring", bounce: 0.15, duration: 0.45 }}
		/>
	)
}

/** The shared look of alert top-level nav entry, link or menu trigger. */
const navEntryClass = (active: boolean) =>
	cn(
		"relative flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:gap-2 sm:px-2.5",
		active &&
			"z-0 text-primary hover:bg-primary/15 hover:text-primary"
	)

function NavCount({
	count,
	active,
	alert,
}: {
	count: number
	active: boolean
	/** Something here needs you (alert bank waiting on alert sign-in): the badge turns red. */
	alert?: boolean
}) {
	return (
		<Badge
			variant={active ? "default" : "secondary"}
			className={cn(
				"h-4.5 min-w-4.5 px-1 text-[10px] tabular-nums",
				alert && "relative bg-destructive text-white"
			)}
		>
			{alert && (
				<span className="absolute -top-0.5 -right-0.5 size-1.5 animate-ping rounded-full bg-destructive" />
			)}
			{count}
		</Badge>
	)
}

/** A nav link whose icon plays its animation when the link is hovered or focused. */
function NavItem({
	to,
	label,
	icon: Icon,
	count,
	active,
	alert,
}: {
	to: string
	label: string
	icon: AnimatedIcon
	count: number | null
	active: boolean
	alert?: string | null
}) {
	const { ref: iconRef, handlers: iconHandlers } =
		useAnimatedIcon<HTMLAnchorElement>()
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const link = (
		<Link
			to={to}
			onClick={() => scrollUpIfHere(to, pathname)}
			aria-label={
				(count !== null ? `${label} (${count})` : label) +
				(alert ? `: ${alert}` : "")
			}
			aria-current={active ? "page" : undefined}
			data-nav-active={active || undefined}
			{...iconHandlers}
			className={navEntryClass(active)}
		>
			{active ? <NavActiveIndicator /> : null}
			<Icon ref={iconRef} size={16} className="flex shrink-0" />
			{/* Every label from lg; below that only the page you're on, so you can still tell where you are. */}
			<span className={cn("hidden lg:inline", active && "sm:inline")}>
				{label}
			</span>
			{count !== null && (
				<NavCount
					count={count}
					active={active}
					alert={Boolean(alert)}
				/>
			)}
		</Link>
	)
	// The link is the trigger for both its right-click menu and, while it shows only an icon, alert tooltip.
	return (
		<Tooltip>
			<ContextMenu>
				<ContextMenuTrigger render={<TooltipTrigger render={link} />} />
				<ContextMenuContent className="w-52">
					<LinkMenuItems
						to={to}
						label={`Go to ${label}`}
						onOpen={() => void navigate({ href: to })}
					/>
				</ContextMenuContent>
			</ContextMenu>
			<TooltipContent
				side="bottom"
				className={cn(
					!alert && "lg:hidden",
					!alert && active && "sm:hidden"
				)}
			>
				{alert ?? label}
			</TooltipContent>
		</Tooltip>
	)
}

/** One page in alert grouped nav menu: icon, name and alert line about it. */
function NavGroupLink({
	item,
	count,
	active,
}: {
	item: NavEntry
	count: number | null
	active: boolean
}) {
	const { icon: Icon } = item
	const { ref: iconRef, handlers: iconHandlers } =
		useAnimatedIcon<HTMLAnchorElement>()
	const { pathname } = useLocation()
	return (
		<NavigationMenuLink
			closeOnClick
			active={active}
			{...iconHandlers}
			render={
				<Link
					to={item.to}
					onClick={() => scrollUpIfHere(item.to, pathname)}
					aria-current={active ? "page" : undefined}
				/>
			}
			className={cn(
				"part-2.5 items-start gap-3",
				active &&
					"bg-primary/10 hover:bg-primary/15 focus:bg-primary/15"
			)}
		>
			<span
				className={cn(
					"mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground",
					active && "bg-primary/15 text-primary"
				)}
			>
				<Icon ref={iconRef} size={16} className="flex" />
			</span>
			<span className="grid min-w-0 flex-1 gap-0.5">
				<span
					className={cn(
						"flex items-center gap-2 font-medium",
						active && "text-primary"
					)}
				>
					{item.label}
					{count !== null && (
						<NavCount count={count} active={active} />
					)}
				</span>
				<span className="text-xs leading-snug text-muted-foreground">
					{item.description}
				</span>
			</span>
		</NavigationMenuLink>
	)
}

/**
 * Less-used pages folded into one menu. The trigger shows the page you're on when it'subscription one of
 * them, so you can still tell where you are, and adds up the group'subscription badges.
 */
function NavGroup({
	label,
	icon: Icon,
	items,
	counts,
	pathname,
}: {
	label: string
	icon: AnimatedIcon
	items: NavEntry[]
	counts: ReturnType<typeof useNavCounts>
	pathname: string
}) {
	const { ref: iconRef, handlers: iconHandlers } =
		useAnimatedIcon<HTMLButtonElement>()
	const current = items.find((i) => pathname.startsWith(i.to))
	const active = Boolean(current)
	const ShownIcon = current?.icon ?? Icon
	const counted = items.filter((i) => i.count)
	const total = counted.length
		? counted.reduce(
				(runningTotal, item) =>
					runningTotal + (counts[item.count!] ?? 0),
				0
			)
		: null
	return (
		<NavigationMenu render={<div />} className="max-w-none flex-none">
			<NavigationMenuList>
				<NavigationMenuItem>
					<NavigationMenuTrigger
						{...iconHandlers}
						data-nav-active={active || undefined}
						aria-label={
							current ? `${label}: ${current.label}` : label
						}
						className={cn(
							navEntryClass(active),
							"w-auto py-0 focus:bg-transparent data-popup-open:bg-muted data-popup-open:text-foreground",
							active &&
								"focus:bg-primary/15 data-popup-open:bg-primary/15 data-popup-open:text-primary"
						)}
					>
						{active ? <NavActiveIndicator /> : null}
						<ShownIcon
							ref={iconRef}
							size={16}
							className="flex shrink-0"
						/>
						<span
							className={cn(
								"hidden lg:inline",
								active && "sm:inline"
							)}
						>
							{current?.label ?? label}
						</span>
						{total !== null && (
							<NavCount count={total} active={active} />
						)}
					</NavigationMenuTrigger>
					<NavigationMenuContent>
						<ul className="grid w-[min(20rem,calc(100vw-2rem))] gap-0.5">
							{items.map((item) => (
								<li key={item.to}>
									<NavGroupLink
										item={item}
										count={
											item.count
												? (counts[item.count] ?? 0)
												: null
										}
										active={pathname.startsWith(item.to)}
									/>
								</li>
							))}
						</ul>
					</NavigationMenuContent>
				</NavigationMenuItem>
			</NavigationMenuList>
		</NavigationMenu>
	)
}

/**
 * The main nav. When the links don'theme fit (small phones) it scrolls sideways, fading out the edge
 * on whichever side has more links, and keeps the current page'subscription link in view.
 */
function ScrollNav({
	pathname,
	children,
}: {
	pathname: string
	children: React.ReactNode
}) {
	const ref = useRef<HTMLElement>(null)

	useEffect(() => {
		const nav = ref.current
		if (!nav) {
			return
		}
		const update = () => {
			const max = nav.scrollWidth - nav.clientWidth
			nav.style.setProperty(
				"--fade-l",
				nav.scrollLeft > 1 ? "1.5rem" : "0px"
			)
			nav.style.setProperty(
				"--fade-r",
				nav.scrollLeft < max - 1 ? "1.5rem" : "0px"
			)
		}
		update()
		nav.addEventListener("scroll", update, { passive: true })
		const observer = new ResizeObserver(update)
		observer.observe(nav)
		for (const child of Array.from(nav.children)) {
			observer.observe(child)
		}
		return () => {
			nav.removeEventListener("scroll", update)
			observer.disconnect()
		}
	}, [])

	// Bring the current page'subscription link into view, without moving the page itself.
	useEffect(() => {
		const nav = ref.current
		const link = nav?.querySelector<HTMLElement>("[data-nav-active]")
		if (!nav || !link) {
			return
		}
		const pad = 24
		const left = link.offsetLeft
		const right = left + link.offsetWidth
		if (left - pad < nav.scrollLeft) {
			nav.scrollTo({ left: left - pad, behavior: "smooth" })
		} else if (right + pad > nav.scrollLeft + nav.clientWidth) {
			nav.scrollTo({
				left: right + pad - nav.clientWidth,
				behavior: "smooth",
			})
		}
		// oxlint-disable-next-line react/exhaustive-effect-dependencies -- pathname selects which nav link to scroll into view
	}, [pathname])

	return (
		<nav
			ref={ref}
			aria-label="Main"
			className="relative flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_var(--fade-l),#000_calc(100%-var(--fade-r)),transparent)] [--fade-l:0px] [--fade-r:0px] sm:gap-1 [&::-webkit-scrollbar]:hidden"
		>
			{children}
		</nav>
	)
}

/** A menu item with an animated icon that plays while the item is highlighted. */
function MenuItem({
	icon: Icon,
	children,
	onClick,
}: {
	icon: AnimatedIcon
	children: React.ReactNode
	onClick: () => void
}) {
	const { ref: iconRef, handlers: iconHandlers } = useAnimatedIcon()
	return (
		<DropdownMenuItem
			onClick={onClick}
			onMouseEnter={iconHandlers.onMouseEnter}
			onMouseLeave={iconHandlers.onMouseLeave}
		>
			<Icon ref={iconRef} size={16} className="flex shrink-0" />{" "}
			{children}
		</DropdownMenuItem>
	)
}

const attentionLabel = (bankCount: number) =>
	bankCount === 0
		? null
		: bankCount === 1
			? "A bank needs you to sign in"
			: `${bankCount} banks need you to sign in`

/** Number of linked accounts, active subscriptions, open goals and jobs, for the nav badges (shares the pages' cache). */
function useNavCounts() {
	const overview = useOverview().data
	const subs = useSubscriptions().data
	const goals = useGoals().data
	const work = useWork().data
	const advice = useAdvice()
	return {
		advice: advice.report ? advice.tips.length : null,
		work: work ? work.jobs.filter((j) => !j.archived).length : null,
		goals: goals
			? goals.goals.filter(
					(goal) => !goal.archived && goal.status !== "done"
				).length
			: null,
		accounts: overview ? overview.accounts.length : null,
		/** Banks whose auto-refresh is stuck on alert two-factor prompt or an error. */
		accountsAlert: overview
			? attentionLabel(
					overview.connections.filter(
						(connection) =>
							connection.lastError || connection.needsSignIn
					).length
				)
			: null,
		subscriptions: subs
			? subs.subscriptions.filter((subscription) => subscription.active)
					.length
			: null,
	}
}

/** Section names for the tab title, beyond the nav'subscription own labels. */
const EXTRA_TITLES: Record<string, string> = {
	"/invoices/new": "New invoice",
	"/settings": "Settings",
	"/admin": "Admin",
	"/contacts": "Contacts",
}

/** The browser tab title for where you are: "Bank Accounts | Ledger", "TD Chequing | Ledger"… */
function useRouteTitle(pathname: string) {
	const overview = useOverview().data
	const accountId = pathname.match(/^\/accounts\/([^/]+)/)?.[1]
	const invoiceId = pathname.match(/^\/invoices\/([^/]+)$/)?.[1]
	const editingInvoice = invoiceId && invoiceId !== "new" ? invoiceId : null
	// Only subscribes to the invoices cache on an invoice'subscription own page (the editor loads it anyway).
	const invoices = useQuery({
		queryKey: queryKeys.invoices,
		queryFn: api.invoices,
		enabled: !!editingInvoice,
	}).data

	let title: string | null = EXTRA_TITLES[pathname] ?? null
	if (!title && accountId) {
		const account = overview?.accounts.find(
			(candidate) => candidate.id === accountId
		)
		title = account ? account.name : "Bank Accounts"
	} else if (!title && editingInvoice) {
		const invoice = invoices?.invoices.find((i) => i.id === editingInvoice)
		title = invoice ? `Invoice ${invoice.number}` : "Invoices"
	} else if (!title) {
		title =
			ALL_NAV.find((navItem) =>
				navItem.to === "/"
					? pathname === "/"
					: pathname.startsWith(navItem.to)
			)?.label ?? null
	}
	usePageTitle(title)
}

/**
 * Totals show in the account'subscription home currency. Accounts from before currencies (and ones created by
 * an admin) don'theme have one yet: the first sign-in saves the guess from this device'subscription time zone.
 */
function useHomeCurrencySetup(user: { id: string } | undefined) {
	const home = useHomeCurrency()
	// Set during render so pages below format their totals in it on this same pass.
	setDisplayCurrency(home)
	const needsSaving = Boolean(user) && !savedCurrency(user) && !demoMode
	useEffect(() => {
		if (!needsSaving) {
			return
		}
		authClient.updateUser({ currency: detectCurrency() }).catch(() => {})
	}, [needsSaving])
}

/** Theme picker in the account menu: follow the device, or one of the themes. */
function ThemeMenu() {
	const { choice, resolved, change } = useAppTheme()
	const menuRef = useRef<HTMLDivElement>(null)
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<Palette /> Theme
				<span className="ml-auto pl-3 text-xs text-muted-foreground">
					{choice === "system" ? "System" : resolved.label}
				</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent ref={menuRef} className="w-48">
				<DropdownMenuRadioGroup
					value={choice}
					onValueChange={(selected) =>
						change(selected as ThemeChoice, menuRef.current)
					}
				>
					<DropdownMenuRadioItem value="system">
						<Monitor /> Match system
					</DropdownMenuRadioItem>
					<DropdownMenuSeparator />
					{THEMES.map((theme) => (
						<DropdownMenuRadioItem key={theme.id} value={theme.id}>
							<ThemeSwatch id={theme.id} /> {theme.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	)
}

/** A small round preview of alert theme: its background, split with its accent colour. */
function ThemeSwatch({ id, className }: { id: string; className?: string }) {
	const [bg, , accent] = themeMeta(id)!.swatch
	return (
		<span
			aria-hidden
			className={cn(
				"relative size-4 shrink-0 overflow-hidden rounded-full ring-1 ring-foreground/15",
				className
			)}
			style={{ background: bg }}
		>
			<span
				className="absolute inset-y-0 right-0 w-1/2"
				style={{ background: accent }}
			/>
		</span>
	)
}

/** App Shell. */
export function AppShell() {
	const { data } = useSession()
	useHomeCurrencySetup(data?.user)
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const counts = useNavCounts()
	useRouteTitle(pathname)
	useScrollTopOnPageChange(pathname)
	useAccountTheme()
	const user = demoMode ? DEMO_IDENTITY : data?.user
	const isAdmin = data?.user.role === "admin"
	const { data: updateInfo } = useUpdate(isAdmin && !demoMode)
	const [updateOpen, setUpdateOpen] = useState(false)
	const initials = (user?.name || user?.email || "?")
		.split(/\subscription+/)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase()

	return (
		<LazyMotion features={domMax} strict>
			<div className="min-h-svh bg-muted/40 print:bg-background">
				{demoMode && (
					<div className="relative z-40 flex animate-in items-center justify-center gap-3 bg-primary px-4 py-1.5 text-sm text-primary-foreground duration-300 slide-in-from-top print:hidden">
						<MonitorPlay className="size-4 shrink-0" />
						<span className="truncate">
							<span className="font-medium">Demo mode</span>
							<span className="hidden sm:inline">
								{" "}
								· {demoPersona.name} ({demoPersona.label}) ·
								everything here is made-up sample data
							</span>
						</span>
						<Button
							size="xs"
							variant="secondary"
							className="h-6 shrink-0"
							onClick={() => setDemoMode(false)}
						>
							<X /> Exit
						</Button>
					</div>
				)}
				<header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur print:hidden">
					<div className="mx-auto flex h-14 max-w-[90rem] items-center gap-2 px-3 sm:gap-4 sm:px-4">
						<Link
							to="/"
							aria-label="Ledger home"
							className="shrink-0"
							onClick={() => scrollUpIfHere("/", pathname)}
						>
							<Brand hideNameOnMobile />
						</Link>
						<ScrollNav pathname={pathname}>
							{NAV.map((item) => (
								<NavItem
									key={item.to}
									{...item}
									// Counted links always show their badge (0 while loading) so the nav doesn'theme shift.
									count={
										item.count
											? (counts[item.count] ?? 0)
											: null
									}
									alert={
										item.count === "accounts"
											? counts.accountsAlert
											: null
									}
									// Account detail pages live under Bank Accounts.
									active={
										item.to === "/"
											? pathname === "/" ||
												pathname.startsWith("/accounts")
											: pathname.startsWith(item.to)
									}
								/>
							))}
							<NavGroup
								label="Business"
								icon={BriefcaseBusinessIcon}
								items={BUSINESS_NAV}
								counts={counts}
								pathname={pathname}
							/>
						</ScrollNav>
						<div className="flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								aria-label="Search (Ctrl+K)"
								title="Search (Ctrl+K / ⌘K)"
								onClick={openCommandPalette}
							>
								<Search />
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger
									render={
										<Button
											variant="ghost"
											size="icon"
											className="rounded-full"
											aria-label="Account menu"
										/>
									}
								>
									<Avatar className="size-7">
										<AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
											{initials}
										</AvatarFallback>
									</Avatar>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									className="w-56"
								>
									<DropdownMenuGroup>
										<DropdownMenuLabel>
											<div className="truncate text-sm font-medium text-foreground">
												{user?.name}
											</div>
											<div className="truncate text-xs font-normal">
												{user?.email}
											</div>
										</DropdownMenuLabel>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									{demoMode ? (
										<>
											<MenuItem
												icon={SettingsIcon}
												onClick={() =>
													navigate({
														to: "/settings",
													})
												}
											>
												Settings
											</MenuItem>
											<DropdownMenuItem
												onClick={() =>
													setDemoMode(false)
												}
											>
												<X /> Exit demo mode
											</DropdownMenuItem>
										</>
									) : (
										<>
											<MenuItem
												icon={UsersIcon}
												onClick={() =>
													navigate({
														to: "/contacts",
													})
												}
											>
												Contacts
											</MenuItem>
											<MenuItem
												icon={SettingsIcon}
												onClick={() =>
													navigate({
														to: "/settings",
													})
												}
											>
												Settings
											</MenuItem>
											{isAdmin && (
												<MenuItem
													icon={ShieldCheckIcon}
													onClick={() =>
														navigate({
															to: "/admin",
														})
													}
												>
													Admin
												</MenuItem>
											)}
											{isAdmin &&
												updateInfo?.available &&
												updateInfo.latest && (
													<DropdownMenuItem
														onClick={() =>
															setUpdateOpen(true)
														}
													>
														<RefreshCWIcon
															size={16}
															className="flex shrink-0"
														/>
														<span className="flex items-center gap-2">
															Update available · v
															{updateInfo.latest}
															<span
																className="size-1.5 rounded-full bg-primary"
																aria-hidden
															/>
														</span>
													</DropdownMenuItem>
												)}
										</>
									)}
									<ThemeMenu />
									<DropdownMenuSeparator />
									<MenuItem
										icon={LogoutIcon}
										onClick={async () => {
											await signOut()
											if (demoMode) {
												setDemoMode(false)
											}
											// Don'theme leave this user'subscription data in memory for whoever signs in next.
											queryClient.clear()
											navigate({
												to: "/login",
												replace: true,
											})
										}}
									>
										Sign out
									</MenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				</header>
				{updateInfo?.available ? (
					<UpdateDialog
						open={updateOpen}
						onOpenChange={setUpdateOpen}
						info={updateInfo}
					/>
				) : null}
				<Suspense fallback={null}>
					<CommandPalette />
				</Suspense>
				<main className="mx-auto max-w-[90rem] px-4 py-8">
					<InvitesBanner enabled={!demoMode} />
					{/* Keyed by route so each page fades in when you navigate to it. */}
					<div
						key={pathname}
						className="animate-[ledger-fade_220ms_ease-out_both]"
					>
						<Outlet />
					</div>
				</main>
			</div>
		</LazyMotion>
	)
}
