import { LinkMenuItems, WithContextMenu } from "@/components/app-context-menu";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { BriefcaseBusinessIcon } from "@/components/icons/briefcase-business";
import { ChartPieIcon } from "@/components/icons/chart-pie";
import { FileTextIcon } from "@/components/icons/file-text";
import { LogoutIcon } from "@/components/icons/logout";
import { RefreshCWIcon } from "@/components/icons/refresh-cw";
import { RocketIcon } from "@/components/icons/rocket";
import { SettingsIcon } from "@/components/icons/settings";
import { ShieldCheckIcon } from "@/components/icons/shield-check";
import {
  type AnimatedIconHandle,
  useAnimatedIcon,
} from "@/components/icons/use-animated-icon";
import { UsersIcon } from "@/components/icons/users";
import { WalletIcon } from "@/components/icons/wallet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import { detectCurrency, savedCurrency, useHomeCurrency } from "@/lib/currency";
import { DEMO_IDENTITY, demoMode, setDemoMode } from "@/lib/demo";
import { setDisplayCurrency } from "@/lib/format";
import { usePageTitle } from "@/lib/page-title";
import {
  queryClient,
  queryKeys,
  useGoals,
  useOverview,
  useSubscriptions,
  useWork,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { MonitorPlay, X } from "lucide-react";
import {
  type ForwardRefExoticComponent,
  type RefAttributes,
  useEffect,
  useRef,
} from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";

type AnimatedIcon = ForwardRefExoticComponent<
  { size?: number; className?: string } & RefAttributes<AnimatedIconHandle>
>;

const NAV: {
  to: string;
  label: string;
  icon: AnimatedIcon;
  count?: "accounts" | "subscriptions" | "goals" | "work";
}[] = [
  { to: "/", label: "Bank Accounts", icon: WalletIcon, count: "accounts" },
  { to: "/insights", label: "Insights", icon: ChartPieIcon },
  {
    to: "/subscriptions",
    label: "Subscriptions",
    icon: RefreshCWIcon,
    count: "subscriptions",
  },
  { to: "/goals", label: "Goals", icon: RocketIcon, count: "goals" },
  { to: "/work", label: "Work", icon: BriefcaseBusinessIcon, count: "work" },
  { to: "/invoices", label: "Invoices", icon: FileTextIcon },
];

/** A nav link whose icon plays its animation when the link is hovered or focused. */
function NavItem({
  to,
  label,
  icon: Icon,
  count,
  active,
}: {
  to: string;
  label: string;
  icon: AnimatedIcon;
  count: number | null;
  active: boolean;
}) {
  const icon = useAnimatedIcon<HTMLAnchorElement>();
  const navigate = useNavigate();
  return (
    <WithContextMenu
      menu={<LinkMenuItems to={to} label={`Go to ${label}`} onOpen={() => void navigate(to)} />}
    >
    <NavLink
      to={to}
      aria-label={count !== null ? `${label} (${count})` : label}
      aria-current={active ? "page" : undefined}
      {...icon.handlers}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm sm:gap-2 sm:px-2.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active &&
          "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
    >
      <Icon ref={icon.ref} size={16} className="flex shrink-0" />
      <span className="hidden lg:inline">{label}</span>
      {count !== null && (
        <Badge
          variant={active ? "default" : "secondary"}
          className="h-4.5 min-w-4.5 px-1 text-[10px] tabular-nums"
        >
          {count}
        </Badge>
      )}
    </NavLink>
    </WithContextMenu>
  );
}

/**
 * The main nav. When the links don't fit (small phones) it scrolls sideways, fading out the edge
 * on whichever side has more links, and keeps the current page's link in view.
 */
function ScrollNav({
  pathname,
  children,
}: {
  pathname: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      nav.style.setProperty("--fade-l", nav.scrollLeft > 1 ? "1.5rem" : "0px");
      nav.style.setProperty(
        "--fade-r",
        nav.scrollLeft < max - 1 ? "1.5rem" : "0px",
      );
    };
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    for (const child of Array.from(nav.children)) observer.observe(child);
    return () => {
      nav.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  // Bring the current page's link into view, without moving the page itself.
  useEffect(() => {
    const nav = ref.current;
    const link = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !link) return;
    const pad = 24;
    const left = link.offsetLeft;
    const right = left + link.offsetWidth;
    if (left - pad < nav.scrollLeft) {
      nav.scrollTo({ left: left - pad, behavior: "smooth" });
    } else if (right + pad > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: right + pad - nav.clientWidth, behavior: "smooth" });
    }
  }, [pathname]);

  return (
    <nav
      ref={ref}
      aria-label="Main"
      className="relative flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [--fade-l:0px] [--fade-r:0px] [mask-image:linear-gradient(to_right,transparent,#000_var(--fade-l),#000_calc(100%-var(--fade-r)),transparent)] sm:gap-1 [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </nav>
  );
}

/** A menu item with an animated icon that plays while the item is highlighted. */
function MenuItem({
  icon: Icon,
  children,
  onClick,
}: {
  icon: AnimatedIcon;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const icon = useAnimatedIcon();
  return (
    <DropdownMenuItem
      onClick={onClick}
      onMouseEnter={icon.handlers.onMouseEnter}
      onMouseLeave={icon.handlers.onMouseLeave}
    >
      <Icon ref={icon.ref} size={16} className="flex shrink-0" /> {children}
    </DropdownMenuItem>
  );
}

/** Number of linked accounts, active subscriptions, open goals and jobs, for the nav badges (shares the pages' cache). */
function useNavCounts() {
  const overview = useOverview().data;
  const subs = useSubscriptions().data;
  const goals = useGoals().data;
  const work = useWork().data;
  return {
    work: work ? work.jobs.filter((j) => !j.archived).length : null,
    goals: goals
      ? goals.goals.filter((g) => !g.archived && g.status !== "done").length
      : null,
    accounts: overview ? overview.accounts.length : null,
    subscriptions: subs
      ? subs.subscriptions.filter((s) => s.active).length
      : null,
  };
}

/** Section names for the tab title, beyond the nav's own labels. */
const EXTRA_TITLES: Record<string, string> = {
  "/invoices/new": "New invoice",
  "/settings": "Settings",
  "/admin": "Admin",
  "/contacts": "Contacts",
};

/** The browser tab title for where you are: "Bank Accounts | Ledger", "TD Chequing | Ledger"… */
function useRouteTitle(pathname: string) {
  const overview = useOverview().data;
  const accountId = pathname.match(/^\/accounts\/([^/]+)/)?.[1];
  const invoiceId = pathname.match(/^\/invoices\/([^/]+)$/)?.[1];
  const editingInvoice = invoiceId && invoiceId !== "new" ? invoiceId : null;
  // Only subscribes to the invoices cache on an invoice's own page (the editor loads it anyway).
  const invoices = useQuery({
    queryKey: queryKeys.invoices,
    queryFn: api.invoices,
    enabled: !!editingInvoice,
  }).data;

  let title: string | null = EXTRA_TITLES[pathname] ?? null;
  if (!title && accountId) {
    const account = overview?.accounts.find((a) => a.id === accountId);
    title = account ? account.name : "Bank Accounts";
  } else if (!title && editingInvoice) {
    const invoice = invoices?.invoices.find((i) => i.id === editingInvoice);
    title = invoice ? `Invoice ${invoice.number}` : "Invoices";
  } else if (!title) {
    title =
      NAV.find((n) =>
        n.to === "/" ? pathname === "/" : pathname.startsWith(n.to),
      )?.label ?? null;
  }
  usePageTitle(title);
}

/**
 * Totals show in the account's home currency. Accounts from before currencies (and ones created by
 * an admin) don't have one yet: the first sign-in saves the guess from this device's time zone.
 */
function useHomeCurrencySetup(user: { id: string } | undefined) {
  const home = useHomeCurrency();
  // Set during render so pages below format their totals in it on this same pass.
  setDisplayCurrency(home);
  const needsSaving = Boolean(user) && !savedCurrency(user) && !demoMode;
  useEffect(() => {
    if (!needsSaving) return;
    authClient.updateUser({ currency: detectCurrency() }).catch(() => {});
  }, [needsSaving]);
}

export function AppShell() {
  const { data } = useSession();
  useHomeCurrencySetup(data?.user);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const counts = useNavCounts();
  useRouteTitle(pathname);
  const user = demoMode ? DEMO_IDENTITY : data?.user;
  const isAdmin = data?.user.role === "admin";
  const initials = (user?.name || user?.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-svh bg-muted/40">
      {demoMode && (
        <div className="relative z-40 flex items-center justify-center gap-3 bg-primary px-4 py-1.5 text-sm text-primary-foreground animate-in slide-in-from-top duration-300">
          <MonitorPlay className="size-4 shrink-0" />
          <span className="truncate">
            <span className="font-medium">Demo mode</span>
            <span className="hidden sm:inline">
              {" "}
              · everything here is made-up sample data
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
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
          <Link to="/" aria-label="Ledger home" className="shrink-0">
            <Brand hideNameOnMobile />
          </Link>
          <ScrollNav pathname={pathname}>
            {NAV.map((item) => (
              <NavItem
                key={item.to}
                {...item}
                count={item.count ? counts[item.count] : null}
                // Account detail pages live under Bank Accounts.
                active={
                  item.to === "/"
                    ? pathname === "/" || pathname.startsWith("/accounts")
                    : pathname.startsWith(item.to)
                }
              />
            ))}
          </ScrollNav>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
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
              <DropdownMenuContent align="end" className="w-56">
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
                      onClick={() => navigate("/settings")}
                    >
                      Settings
                    </MenuItem>
                    <DropdownMenuItem onClick={() => setDemoMode(false)}>
                      <X /> Exit demo mode
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <MenuItem
                      icon={UsersIcon}
                      onClick={() => navigate("/contacts")}
                    >
                      Contacts
                    </MenuItem>
                    <MenuItem
                      icon={SettingsIcon}
                      onClick={() => navigate("/settings")}
                    >
                      Settings
                    </MenuItem>
                    {isAdmin && (
                      <MenuItem
                        icon={ShieldCheckIcon}
                        onClick={() => navigate("/admin")}
                      >
                        Admin
                      </MenuItem>
                    )}
                  </>
                )}
                <DropdownMenuSeparator />
                <MenuItem
                  icon={LogoutIcon}
                  onClick={async () => {
                    await signOut();
                    if (demoMode) setDemoMode(false);
                    // Don't leave this user's data in memory for whoever signs in next.
                    queryClient.clear();
                    navigate("/login", { replace: true });
                  }}
                >
                  Sign out
                </MenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Keyed by route so each page fades in when you navigate to it. */}
        <div
          key={pathname}
          className="animate-[ledger-fade_220ms_ease-out_both]"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
