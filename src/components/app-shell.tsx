import { MonitorPlay, X } from 'lucide-react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'
import { useTheme } from 'next-themes'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Brand } from '@/components/brand'
import { BriefcaseBusinessIcon } from '@/components/icons/briefcase-business'
import { ChartPieIcon } from '@/components/icons/chart-pie'
import { FileTextIcon } from '@/components/icons/file-text'
import { LogoutIcon } from '@/components/icons/logout'
import { MoonIcon } from '@/components/icons/moon'
import { RefreshCWIcon } from '@/components/icons/refresh-cw'
import { RocketIcon } from '@/components/icons/rocket'
import { SettingsIcon } from '@/components/icons/settings'
import { ShieldCheckIcon } from '@/components/icons/shield-check'
import { SunIcon } from '@/components/icons/sun'
import { type AnimatedIconHandle, useAnimatedIcon } from '@/components/icons/use-animated-icon'
import { WalletIcon } from '@/components/icons/wallet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut, useSession } from '@/lib/auth-client'
import { DEMO_IDENTITY, demoMode, setDemoMode } from '@/lib/demo'
import { queryClient, useGoals, useOverview, useSubscriptions } from '@/lib/queries'
import { cn } from '@/lib/utils'

type AnimatedIcon = ForwardRefExoticComponent<{ size?: number; className?: string } & RefAttributes<AnimatedIconHandle>>

const NAV: { to: string; label: string; icon: AnimatedIcon; count?: 'accounts' | 'subscriptions' | 'goals' }[] = [
  { to: '/', label: 'Bank Accounts', icon: WalletIcon, count: 'accounts' },
  { to: '/insights', label: 'Insights', icon: ChartPieIcon },
  { to: '/subscriptions', label: 'Subscriptions', icon: RefreshCWIcon, count: 'subscriptions' },
  { to: '/goals', label: 'Goals', icon: RocketIcon, count: 'goals' },
  { to: '/work', label: 'Work', icon: BriefcaseBusinessIcon },
  { to: '/invoices', label: 'Invoices', icon: FileTextIcon },
]

/** A nav link whose icon plays its animation when the link is hovered or focused. */
function NavItem({
  to,
  label,
  icon: Icon,
  count,
  active,
}: {
  to: string
  label: string
  icon: AnimatedIcon
  count: number | null
  active: boolean
}) {
  const icon = useAnimatedIcon<HTMLAnchorElement>()
  return (
    <NavLink
      to={to}
      aria-label={count !== null ? `${label} (${count})` : label}
      aria-current={active ? 'page' : undefined}
      {...icon.handlers}
      className={cn(
        'flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        active && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
      )}
    >
      <Icon ref={icon.ref} size={16} className="flex shrink-0" />
      <span className="hidden lg:inline">{label}</span>
      {count !== null && (
        <Badge variant={active ? 'default' : 'secondary'} className="h-4.5 min-w-4.5 px-1 text-[10px] tabular-nums">
          {count}
        </Badge>
      )}
    </NavLink>
  )
}

/** A menu item with an animated icon that plays while the item is highlighted. */
function MenuItem({ icon: Icon, children, onClick }: { icon: AnimatedIcon; children: React.ReactNode; onClick: () => void }) {
  const icon = useAnimatedIcon()
  return (
    <DropdownMenuItem onClick={onClick} onMouseEnter={icon.handlers.onMouseEnter} onMouseLeave={icon.handlers.onMouseLeave}>
      <Icon ref={icon.ref} size={16} className="flex shrink-0" /> {children}
    </DropdownMenuItem>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const icon = useAnimatedIcon<HTMLButtonElement>()
  const dark = resolvedTheme === 'dark'
  const Icon = dark ? SunIcon : MoonIcon
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" {...icon.handlers} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      <Icon key={String(dark)} ref={icon.ref} size={16} className="flex" />
    </Button>
  )
}

/** Number of linked accounts, active subscriptions and open goals, for the nav badges (shares the pages' cache). */
function useNavCounts() {
  const overview = useOverview().data
  const subs = useSubscriptions().data
  const goals = useGoals().data
  return {
    goals: goals ? goals.goals.filter((g) => !g.archived && g.status !== 'done').length : null,
    accounts: overview ? overview.accounts.length : null,
    subscriptions: subs ? subs.subscriptions.filter((s) => s.active).length : null,
  }
}

export function AppShell() {
  const { data } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const counts = useNavCounts()
  const user = demoMode ? DEMO_IDENTITY : data?.user
  const isAdmin = data?.user.role === 'admin'
  const initials = (user?.name || user?.email || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="min-h-svh bg-muted/40">
      {demoMode && (
        <div className="relative z-40 flex items-center justify-center gap-3 bg-primary px-4 py-1.5 text-sm text-primary-foreground animate-in slide-in-from-top duration-300">
          <MonitorPlay className="size-4 shrink-0" />
          <span className="truncate">
            <span className="font-medium">Demo mode</span>
            <span className="hidden sm:inline"> · everything here is made-up sample data</span>
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
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/" aria-label="Ledger home">
            <Brand hideNameOnMobile />
          </Link>
          <nav className="flex flex-1 items-center gap-1" aria-label="Main">
            {NAV.map((item) => (
              <NavItem
                key={item.to}
                {...item}
                count={item.count ? counts[item.count] : null}
                // Account detail pages live under Bank Accounts.
                active={item.to === '/' ? pathname === '/' || pathname.startsWith('/accounts') : pathname.startsWith(item.to)}
              />
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" />}>
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="truncate text-sm font-medium text-foreground">{user?.name}</div>
                    <div className="truncate text-xs font-normal">{user?.email}</div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {demoMode ? (
                  <DropdownMenuItem onClick={() => setDemoMode(false)}>
                    <X /> Exit demo mode
                  </DropdownMenuItem>
                ) : (
                  <>
                    <MenuItem icon={SettingsIcon} onClick={() => navigate('/settings')}>
                      Settings
                    </MenuItem>
                    {isAdmin && (
                      <MenuItem icon={ShieldCheckIcon} onClick={() => navigate('/admin')}>
                        Admin
                      </MenuItem>
                    )}
                  </>
                )}
                <DropdownMenuSeparator />
                <MenuItem
                  icon={LogoutIcon}
                  onClick={async () => {
                    await signOut()
                    if (demoMode) setDemoMode(false)
                    // Don't leave this user's data in memory for whoever signs in next.
                    queryClient.clear()
                    navigate('/login', { replace: true })
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
        <div key={pathname} className="animate-[ledger-fade_220ms_ease-out_both]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
