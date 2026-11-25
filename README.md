<p align="center">
  <img src="assets/icon.svg" width="72" height="72" alt="Ledger logo">
</p>

<h1 align="center">Ledger</h1>

<p align="center">A self-hosted personal finance dashboard that pulls in your bank data on its own.</p>

![Ledger dashboard](assets/screenshots/dashboard.png)

## Why I made it

I wanted one place to see my transactions, how much I'm earning, what subscriptions I'm paying for and how close I am to my goals, without logging into a bunch of different sites and copying numbers into a spreadsheet. So I built Ledger. You link your accounts once, and it signs in and fetches new transactions by itself in the background, so everything stays up to date without you touching it.

## What it does

- **Bank accounts**: balances, overdraft and credit, a balance history chart, cash flow, upcoming payments and recent activity, with a page for each account.
- **Insights**: spending by category, top merchants and month-by-month cash flow. Transfers between your own accounts are ignored so nothing gets counted twice.
- **Subscriptions**: track recurring payments on any schedule, see them on a calendar, and get suggestions for recurring charges it spots in your transactions.
- **Goals**: save up for something or pay something off. Log payments as you go and it tells you what you need to put in each month to hit your deadline.
- **Work**: log hours for side work, bill them, and track each payment until you're paid in full.
- **Invoices**: make an invoice from scratch or from a Work bill in a few clicks, pick from three PDF designs, and choose how you want to be paid (e-Transfer, PayPal.me, PayPal checkout, crypto, bank transfer, cash and more). Share a link the client can open without signing in, or send them the PDF. Payments made through PayPal checkout are marked paid on the spot.
- **Sharing**: share a goal, subscription or job with another Ledger user, as view-only or editable. Pick them from your **Contacts** (in the user menu) or type their email. They need an account on the same server; only the owner can delete, archive or change who it's shared with, and the owner's bank accounts are never shown.
- **Any currency**: accounts, goals, subscriptions and bills can each have their own currency. Totals are converted into your default currency (picked in Settings, or guessed from your time zone) using live mid-market rates (refreshed hourly, falling back to the ECB's daily reference rates).
- **Automatic refresh**: saved connections are refreshed every 6 hours in the background.
- **Multi-user**: the first account is the admin. Admins can add users, open or close sign-ups, and see an audit log. Two-factor sign-in is supported.
- **Demo mode**: fills every page with made-up data, handy for showing it off (the screenshots here use it).

Ledger currently connects to **TD EasyWeb** and **PayPal**.

## Screenshots

<table>
  <tr>
    <td><img src="assets/screenshots/insights.png" alt="Insights"></td>
    <td><img src="assets/screenshots/subscriptions.png" alt="Subscriptions"></td>
  </tr>
  <tr>
    <td align="center">Insights</td>
    <td align="center">Subscriptions</td>
  </tr>
  <tr>
    <td><img src="assets/screenshots/goals.png" alt="Goals"></td>
    <td><img src="assets/screenshots/work.png" alt="Work"></td>
  </tr>
  <tr>
    <td align="center">Goals</td>
    <td align="center">Work</td>
  </tr>
</table>

## Getting started

You'll need [Bun](https://bun.sh) 1.3+ and Node.js 22.5+ (the API uses `node:sqlite`).

```bash
bun install
bunx playwright install chromium   # used to sign in to TD EasyWeb
cp .env.example .env               # optional, every setting has a default
bun run dev                        # API on :3001, app on http://localhost:5173
```

Create an account (the first one becomes the admin), click **Add account** and pick a bank.

For production:

```bash
bun run build && bun run start     # serves the app and API from one port
```

## Self-hosting with Docker

A prebuilt image is published to GitHub Packages on every push to `master`. Grab [`docker-compose.yml`](docker-compose.yml) and run:

```bash
docker compose up -d     # http://localhost:3001
```

Data (database, generated secret, backups) lives in the `ledger-data` volume. Set `APP_URL`, `APP_SECRET` and the other [settings](#configuration) in a `.env` next to the compose file. Generate a secret with `openssl rand -hex 32` (at least 32 characters). If the package is private, run `docker login ghcr.io` first.

## Connecting accounts

**TD.** TD doesn't have a public API, so the server signs in to EasyWeb with a headless browser (Playwright), reads your accounts and transactions, and saves them. If TD asks for a 2-Step Verification code, the app asks you for it. Refreshes only pull in what's new. Set `TD_HEADLESS=false` to watch the browser while it works.

**PayPal.** Uses PayPal's official REST API. Create a **Live** app on [developer.paypal.com](https://developer.paypal.com/dashboard/applications/live) with a Business account, turn on **Transaction Search**, and paste the app's Client ID and Secret into Ledger.

**PayPal instant updates (optional).** Choose **Turn on instant updates** from the connection's menu and Ledger registers a webhook with your PayPal app. Two limits apply:

- PayPal [webhooks](https://developer.paypal.com/api/rest/webhooks/) only fire for payments that go through your REST app, such as invoice checkouts. Everything else still comes in through the Transaction Search sync, which PayPal can lag by about 3 hours.
- PayPal has to be able to reach the server, so `PUBLIC_URL` must be a public `https://` address (for example a tunnel or your own domain).

## Security

- Your bank password is only saved if you tick **Save credentials**. Saved credentials, API keys and account numbers are encrypted with AES-256-GCM using `APP_SECRET` (generated into `data/.secret` if you don't set one; to pick your own, run `openssl rand -hex 32`).
- Everything lives in a local SQLite database in `data/`. It's git-ignored; don't commit or share it.
- Passwords need at least 10 characters with a lowercase and uppercase letter, a number and a symbol. The server enforces this too.
- Sign-in is rate-limited, sign-ups are closed after the first account unless an admin opens them, and the server sends strict security headers.
- Automated access may be against your bank's terms of service. Use it for your own accounts, at your own risk.

## Configuration

All optional. See [`.env.example`](.env.example).

| Variable             | Default                                                   | Purpose                                                                                           |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `PORT`               | `3001`                                                    | API port                                                                                          |
| `APP_URL`            | `http://localhost:5173`                                   | Public URL of the app                                                                             |
| `PUBLIC_URL`         | `APP_URL`                                                 | Address used for invoice share links and PayPal webhooks (must be public `https://` for webhooks) |
| `APP_SECRET`         | generated                                                 | Signs sessions and encrypts saved credentials                                                     |
| `DATA_DIR`           | `./data`                                                  | Where the database lives                                                                          |
| `TD_HEADLESS`        | `true`                                                    | `false` to watch the browser sign in                                                              |
| `TD_BROWSER_CHANNEL` |                                                           | e.g. `chrome` to use your installed Chrome                                                        |
| `ALLOW_REGISTRATION` | `false`                                                   | Whether sign-ups start open after the first account                                               |
| `TRUST_PROXY`        | `false`                                                   | `true` behind a reverse proxy, so rate limits see the real client IP                              |
| `FX_LIVE_URL`        | `https://api.coinbase.com/v2/exchange-rates?currency=USD` | Where live exchange rates are fetched from (Coinbase-compatible; empty to turn off)               |
| `FX_RATES_URL`       | `https://api.frankfurter.dev/v1/latest`                   | Fallback daily ECB rates (Frankfurter-compatible)                                                 |
| `PAYPAL_ENV`         | `live`                                                    | `sandbox` to test against PayPal's sandbox                                                        |

## Built with

React, Vite, Tailwind CSS and shadcn/ui on the front end. Hono, Better Auth, SQLite and Playwright on the server.

```bash
bun test server     # tests
bun run typecheck
bun run lint
```
