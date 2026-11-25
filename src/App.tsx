import { QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { lazy, type ReactNode, Suspense } from 'react'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AppShell } from '@/components/app-shell'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSession } from '@/lib/auth-client'
import { demoMode } from '@/lib/demo'
import { queryClient } from '@/lib/queries'
import { AuthPage } from '@/pages/auth-page'
import { ChangeTemporaryPasswordPage } from '@/pages/temporary-password-page'

// Pages load on demand so the sign-in screen doesn't pull in the charting code.
const DashboardPage = lazy(() => import('@/pages/dashboard-page').then((m) => ({ default: m.DashboardPage })))
const AccountPage = lazy(() => import('@/pages/account-page').then((m) => ({ default: m.AccountPage })))
const InsightsPage = lazy(() => import('@/pages/insights-page').then((m) => ({ default: m.InsightsPage })))
const SubscriptionsPage = lazy(() => import('@/pages/subscriptions-page').then((m) => ({ default: m.SubscriptionsPage })))
const SettingsPage = lazy(() => import('@/pages/settings-page').then((m) => ({ default: m.SettingsPage })))
const GoalsPage = lazy(() => import('@/pages/goals-page').then((m) => ({ default: m.GoalsPage })))
const WorkPage = lazy(() => import('@/pages/work-page').then((m) => ({ default: m.WorkPage })))
const InvoicesPage = lazy(() => import('@/pages/invoices-page').then((m) => ({ default: m.InvoicesPage })))
const InvoiceEditorPage = lazy(() => import('@/pages/invoice-editor-page').then((m) => ({ default: m.InvoiceEditorPage })))
const PublicInvoicePage = lazy(() => import('@/pages/public-invoice-page').then((m) => ({ default: m.PublicInvoicePage })))
const AdminPage = lazy(() => import('@/pages/admin-page').then((m) => ({ default: m.AdminPage })))

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function RequireAuth() {
  const { data, isPending } = useSession()
  if (isPending) return <FullScreenSpinner />
  if (!data) return <Navigate to="/login" replace />
  // An admin set this password: the person picks their own before seeing anything else.
  if (data.user.mustChangePassword) return <ChangeTemporaryPasswordPage />
  return <Outlet />
}

/** Real-account pages: admins only, and hidden while showing demo data. */
function RequireAdmin() {
  const { data } = useSession()
  return data?.user.role === 'admin' && !demoMode ? <Outlet /> : <Navigate to="/" replace />
}

/** Settings shows your real devices and email, so it's off-limits in demo mode. */
function NotInDemo() {
  return demoMode ? <Navigate to="/" replace /> : <Outlet />
}

function GuestOnly() {
  const { data, isPending } = useSession()
  if (isPending) return <FullScreenSpinner />
  return data ? <Navigate to="/" replace /> : <Outlet />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delay={300}>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Page><DashboardPage /></Page>} />
              <Route path="/accounts/:id" element={<Page><AccountPage /></Page>} />
              <Route path="/insights" element={<Page><InsightsPage /></Page>} />
              <Route path="/subscriptions" element={<Page><SubscriptionsPage /></Page>} />
              <Route path="/goals" element={<Page><GoalsPage /></Page>} />
              <Route path="/work" element={<Page><WorkPage /></Page>} />
              <Route path="/invoices" element={<Page><InvoicesPage /></Page>} />
              <Route path="/invoices/new" element={<Page><InvoiceEditorPage /></Page>} />
              <Route path="/invoices/:id" element={<Page><InvoiceEditorPage /></Page>} />
              <Route element={<NotInDemo />}>
                <Route path="/settings" element={<Page><SettingsPage /></Page>} />
              </Route>
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<Page><AdminPage /></Page>} />
              </Route>
            </Route>
          </Route>
          {/* The share link you send people: no sign-in. */}
          <Route path="/i/:token" element={<Page><PublicInvoicePage /></Page>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </TooltipProvider>
      <Toaster richColors position="top-center" />
    </ThemeProvider>
    </QueryClientProvider>
  )
}
