import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { csrf } from 'hono/csrf'
import { secureHeaders } from 'hono/secure-headers'
import type { HttpBindings } from '@hono/node-server'
import { audit, getOwnerId, migrateAdminTables, recentAudit } from './admin.ts'
import { auth, CLIENT_IP_HEADER, migrateAuthTables, registrationOpen } from './auth.ts'
import { migrateAppTables, setSetting } from './db.ts'
import { DEMO_USER_ID, ensureDemoData } from './demo.ts'
import { DATA_DIR, env } from './env.ts'
import { banks } from './routes/banks.ts'
import { finance } from './routes/finance.ts'
import { work } from './routes/work.ts'
import { hasTask, listTasks, runTask, startScheduler } from './tasks.ts'

await migrateAuthTables()
migrateAppTables()
migrateAdminTables()
removeOldDebugDumps()

type Vars = { Bindings: HttpBindings; Variables: { user: typeof auth.$Infer.Session.user } }
const app = new Hono<Vars>()

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Tailwind/Base UI set inline style attributes; charts use inline SVG styles.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
    },
    referrerPolicy: 'same-origin',
  }),
)
app.use('/api/*', compress())
// Every API body is small JSON; refuse anything large before it's parsed.
app.use('/api/*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'Request too large' }, 413) }))
// Rejects cross-site form posts (JSON requests are already blocked by CORS preflight).
app.use('/api/*', csrf({ origin: env.appUrl }))

/**
 * Who's calling, for rate limits and the Devices list. Behind a reverse proxy set TRUST_PROXY=true
 * and the proxy's X-Forwarded-For is used; otherwise the socket address. A client-sent copy of the
 * header is always replaced, so it can't be used to dodge the sign-in limits.
 */
app.use('/api/*', async (c, next) => {
  const forwarded = env.trustProxy ? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() : undefined
  const ip = forwarded || c.env?.incoming?.socket?.remoteAddress || ''
  c.req.raw.headers.set(CLIENT_IP_HEADER, ip.replace(/^::ffff:/, ''))
  await next()
})

/** Signed in on a temporary password: only the change-password screen works until it's replaced. */
const mustChangePassword = (user: object) => (user as { mustChangePassword?: boolean }).mustChangePassword === true
const PASSWORD_CHANGE_REQUIRED = { error: 'Choose a new password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' }

app.get('/api/config', (c) => c.json({ registrationOpen: registrationOpen() }))

// Single-user by default: once an account exists, sign-up is closed (see ALLOW_REGISTRATION).
app.post('/api/auth/sign-up/*', async (c, next) => {
  if (!registrationOpen()) return c.json({ message: 'Registration is closed.' }, 403)
  await next()
})
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

app.use('/api/banks/*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  if (mustChangePassword(session.user)) return c.json(PASSWORD_CHANGE_REQUIRED, 403)
  c.header('Cache-Control', 'no-store')
  // Demo mode: show the made-up demo user's data instead of the caller's, read-only.
  if (c.req.header('x-ledger-demo') === '1') {
    if (c.req.method !== 'GET') return c.json({ error: 'Demo mode is read-only. Exit demo mode to make changes.' }, 403)
    ensureDemoData()
    c.set('user', { ...session.user, id: DEMO_USER_ID })
  } else {
    c.set('user', session.user)
  }
  await next()
})
app.route('/api/banks', banks)
app.route('/api/banks', finance)
app.route('/api/banks', work)

// Instance settings for admins. User management itself goes through Better Auth's /api/auth/admin/*.
app.use('/api/admin/*', async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Unauthorized' }, 401)
  if (session.user.role !== 'admin') return c.json({ error: 'Admins only' }, 403)
  if (mustChangePassword(session.user)) return c.json(PASSWORD_CHANGE_REQUIRED, 403)
  c.header('Cache-Control', 'no-store')
  c.set('user', session.user)
  await next()
})
const adminSettings = () => ({ registrationOpen: registrationOpen(), ownerId: getOwnerId() })
app.get('/api/admin/settings', (c) => c.json(adminSettings()))
app.put('/api/admin/settings', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { registrationOpen?: unknown }
  if (typeof body.registrationOpen !== 'boolean') return c.json({ error: 'Invalid request' }, 400)
  if (body.registrationOpen !== registrationOpen()) {
    setSetting('registration_open', String(body.registrationOpen))
    const user = c.var.user
    audit({
      kind: 'admin',
      ip: c.req.header(CLIENT_IP_HEADER),
      actorId: user.id,
      actorEmail: user.email,
      action: body.registrationOpen ? 'Opened sign-ups' : 'Closed sign-ups',
    })
  }
  return c.json(adminSettings())
})
app.get('/api/admin/tasks', (c) => c.json({ tasks: listTasks() }))
app.post('/api/admin/tasks/:id/run', (c) => {
  const id = c.req.param('id')
  if (!hasTask(id)) return c.json({ error: 'Not found' }, 404)
  if (listTasks().find((t) => t.id === id)?.running) return c.json({ error: 'That task is already running.' }, 409)
  const user = c.var.user
  const label = listTasks().find((t) => t.id === id)?.label ?? id
  audit({ kind: 'admin', ip: c.req.header(CLIENT_IP_HEADER), actorId: user.id, actorEmail: user.email, action: 'Ran task', detail: label })
  // It can take minutes (a browser per bank); the page polls for the result.
  void runTask(id, 'manual')
  return c.json({ tasks: listTasks() }, 202)
})
app.get('/api/admin/audit', (c) => {
  const kind = c.req.query('kind')
  return c.json({ entries: recentAudit({ kind: kind === 'admin' || kind === 'auth' ? kind : undefined, limit: 200 }) })
})
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

// In production, serve the built SPA from the same origin.
const dist = path.resolve('dist')
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Something went wrong.' }, 500)
})

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
  startScheduler()
})

/** Older builds saved screenshots of bank pages to data/debug; they're no longer needed. */
function removeOldDebugDumps() {
  rmSync(path.join(DATA_DIR, 'debug'), { recursive: true, force: true })
}
