import { QueryClientProvider } from "@tanstack/react-query"
import { lazy, type ReactNode, Suspense, useEffect } from "react"
import { ThemeProvider } from "next-themes"
import { NuqsAdapter } from "nuqs/adapters/react-router/v8"
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from "react-router"
import { AppLoader } from "@/components/layout/app-loader"
import { ErrorBoundary } from "@/components/layout/error-boundary"
import { useNoNativeContextMenu } from "@/components/layout/app-context-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useSession } from "@/lib/auth-client"
import { demoMode } from "@/lib/demo"
import { THEME_CLASSES } from "@/lib/theme-classes"
import { THEME_IDS } from "../shared/themes.ts"
import { queryClient } from "@/lib/queries"
import { AuthPage } from "@/pages/auth-page"

const AppShell = lazy(() =>
  import("@/components/layout/app-shell").then((m) => ({ default: m.AppShell }))
)
const ConfirmHost = lazy(() =>
  import("@/components/common/confirm-dialog").then((m) => ({
    default: m.ConfirmHost,
  }))
)
const Toaster = lazy(() =>
  import("@/components/ui/sonner").then((m) => ({ default: m.Toaster }))
)
const ChangeTemporaryPasswordPage = lazy(() =>
  import("@/pages/temporary-password-page").then((m) => ({
    default: m.ChangeTemporaryPasswordPage,
  }))
)

// Pages load on demand so the sign-in screen doesn't pull in the charting code.
const DashboardPage = lazy(() =>
  import("@/pages/dashboard-page").then((m) => ({ default: m.DashboardPage }))
)
const AccountPage = lazy(() =>
  import("@/pages/account-page").then((m) => ({ default: m.AccountPage }))
)
const InsightsPage = lazy(() =>
  import("@/pages/insights-page").then((m) => ({ default: m.InsightsPage }))
)
const TransactionsPage = lazy(() =>
  import("@/pages/transactions-page").then((m) => ({
    default: m.TransactionsPage,
  }))
)
const SubscriptionsPage = lazy(() =>
  import("@/pages/subscriptions-page").then((m) => ({
    default: m.SubscriptionsPage,
  }))
)
const ContactsPage = lazy(() =>
  import("@/pages/contacts-page").then((m) => ({ default: m.ContactsPage }))
)
const SettingsPage = lazy(() =>
  import("@/pages/settings-page").then((m) => ({ default: m.SettingsPage }))
)
const AdvisorPage = lazy(() =>
  import("@/pages/advisor-page").then((m) => ({ default: m.AdvisorPage }))
)
const GoalsPage = lazy(() =>
  import("@/pages/goals-page").then((m) => ({ default: m.GoalsPage }))
)
const WorkPage = lazy(() =>
  import("@/pages/work-page").then((m) => ({ default: m.WorkPage }))
)
const InvoicesPage = lazy(() =>
  import("@/pages/invoices-page").then((m) => ({ default: m.InvoicesPage }))
)
const InvoiceEditorPage = lazy(() =>
  import("@/pages/invoice-editor-page").then((m) => ({
    default: m.InvoiceEditorPage,
  }))
)
const PublicInvoicePage = lazy(() =>
  import("@/pages/public-invoice-page").then((m) => ({
    default: m.PublicInvoicePage,
  }))
)
const TaxesPage = lazy(() =>
  import("@/pages/taxes-page").then((m) => ({ default: m.TaxesPage }))
)
const AdminPage = lazy(() =>
  import("@/pages/admin-page").then((m) => ({ default: m.AdminPage }))
)

function Page({ children }: { children: ReactNode }) {
  // A page that crashes shows an error panel in place; going to another page clears it.
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname}>
      {/* The loader stays where the boot screen put it. Once a page has shown, it fades in after a beat
        so quick page switches don't flash it. */}
      <Suspense fallback={<AppLoader inPage delayed={pageShown} />}>
        <PageShown />
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

let pageShown = false

function PageShown() {
  useEffect(() => {
    pageShown = true
  }, [])
  return null
}

/**
 * Set while this browser has a session, so a reload can put the app's header up straight away
 * instead of waiting on the session check. If the session turns out to be gone, it's off to sign in.
 */
const SIGNED_IN_KEY = "ledger.signed-in"

function rememberSignedIn(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_KEY, "1")
    else localStorage.removeItem(SIGNED_IN_KEY)
  } catch {
    // Storage blocked: the first load just waits on the session check.
  }
}

function probablySignedIn() {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === "1"
  } catch {
    return false
  }
}

function RequireAuth() {
  const { data, isPending } = useSession()
  useEffect(() => {
    if (!isPending) rememberSignedIn(Boolean(data))
  }, [data, isPending])
  if (isPending) return probablySignedIn() ? <Outlet /> : <AppLoader />
  if (!data) return <Navigate to="/login" replace />
  // An admin set this password: the person picks their own before seeing anything else.
  if (data.user.mustChangePassword)
    return (
      <Suspense fallback={<AppLoader />}>
        <ChangeTemporaryPasswordPage />
      </Suspense>
    )
  return <Outlet />
}

/** Real-account pages: admins only, and hidden while showing demo data. */
function RequireAdmin() {
  const { data, isPending } = useSession()
  if (isPending) return <AppLoader inPage />
  return data?.user.role === "admin" && !demoMode ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace />
  )
}

/** Contacts are real people, so they're off-limits in demo mode. (Settings opens with only Preferences usable.) */
function NotInDemo() {
  return demoMode ? <Navigate to="/" replace /> : <Outlet />
}

function GuestOnly() {
  const { data, isPending } = useSession()
  if (isPending) return <AppLoader />
  return data ? <Navigate to="/" replace /> : <Outlet />
}

// A data router, so pages can block navigation (e.g. the invoice editor with unsaved changes).
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      element={
        // Inside the router: nuqs reads and writes the address through React Router.
        <NuqsAdapter>
          <Outlet />
        </NuqsAdapter>
      }
      errorElement={<ErrorBoundary fullScreen>{null}</ErrorBoundary>}
    >
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route
          element={
            <Suspense fallback={<AppLoader inPage />}>
              <AppShell />
            </Suspense>
          }
        >
          <Route
            index
            element={
              <Page>
                <DashboardPage />
              </Page>
            }
          />
          <Route
            path="/accounts/:id"
            element={
              <Page>
                <AccountPage />
              </Page>
            }
          />
          <Route
            path="/transactions"
            element={
              <Page>
                <TransactionsPage />
              </Page>
            }
          />
          <Route
            path="/insights"
            element={
              <Page>
                <InsightsPage />
              </Page>
            }
          />
          <Route
            path="/subscriptions"
            element={
              <Page>
                <SubscriptionsPage />
              </Page>
            }
          />
          <Route
            path="/goals"
            element={
              <Page>
                <GoalsPage />
              </Page>
            }
          />
          <Route
            path="/advisor"
            element={
              <Page>
                <AdvisorPage />
              </Page>
            }
          />
          <Route
            path="/work"
            element={
              <Page>
                <WorkPage />
              </Page>
            }
          />
          <Route
            path="/invoices"
            element={
              <Page>
                <InvoicesPage />
              </Page>
            }
          />
          <Route
            path="/invoices/new"
            element={
              <Page>
                <InvoiceEditorPage />
              </Page>
            }
          />
          <Route
            path="/invoices/:id"
            element={
              <Page>
                <InvoiceEditorPage />
              </Page>
            }
          />
          <Route
            path="/taxes"
            element={
              <Page>
                <TaxesPage />
              </Page>
            }
          />
          <Route
            path="/settings"
            element={
              <Page>
                <SettingsPage />
              </Page>
            }
          />
          <Route element={<NotInDemo />}>
            <Route
              path="/contacts"
              element={
                <Page>
                  <ContactsPage />
                </Page>
              }
            />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route
              path="/admin"
              element={
                <Page>
                  <AdminPage />
                </Page>
              }
            />
          </Route>
        </Route>
      </Route>
      {/* The share link you send people: no sign-in. */}
      <Route
        path="/i/:token"
        element={
          <Page>
            <PublicInvoicePage />
          </Page>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  )
)

export default function App() {
  useNoNativeContextMenu()
  return (
    <ErrorBoundary fullScreen>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          themes={THEME_IDS}
          value={THEME_CLASSES}
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={300}>
            <RouterProvider router={router} />
          </TooltipProvider>
          <Suspense fallback={null}>
            <ConfirmHost />
            <Toaster />
          </Suspense>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
