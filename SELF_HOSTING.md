# Self-hosting Ledger

Ledger is a single process: the built web app and API on one port (`3001` by default), with Playwright’s Chromium for TD EasyWeb login.

## Table of contents

- [Requirements](#requirements)
- [Docker Compose](#docker-compose)
- [Plain docker run](#plain-docker-run)
- [Bare metal](#bare-metal)
- [Running as a systemd service](#running-as-a-systemd-service)
- [Reverse proxy](#reverse-proxy)
- [Sign-ups and sharing](#sign-ups-and-sharing)
- [Backups and restore](#backups-and-restore)
- [Updating](#updating)
- [Unattended updates (Watchtower)](#unattended-updates-watchtower)
- [Email deliverability](#email-deliverability)
- [Troubleshooting](#troubleshooting)

## Requirements

- **Docker**: enough disk for the image (~Chromium included) and a bind mount for data. Give the container **at least 1 GB `shm_size`** so TD’s headless browser does not crash.
- **Bare metal**: [Bun](https://bun.sh) 1.3+ (the server runs on Bun with `bun:sqlite`; Node.js is not needed). Playwright Chromium (`bunx playwright install chromium`) for TD. A Linux or macOS host is typical; Windows works for development.

## Docker Compose

The repo ships [`docker-compose.yml`](docker-compose.yml). It pulls **`ghcr.io/rainnny7/ledger:latest`**, binds **`127.0.0.1:3001`** (loopback only), mounts **`./data` → `/data`**, and sets `shm_size: 1gb`. Put nginx, Caddy, or similar in front for remote HTTPS access and set `TRUST_PROXY` to match your hop count.

```bash
cp .env.example .env    # optional; edit APP_URL, APP_SECRET, etc.
docker compose up -d
```

Open `http://localhost:3001` (or your `APP_URL`) and create an account. The first user is the admin.

**Environment.** Values in `.env` next to the compose file are passed through for `APP_URL`, `PUBLIC_URL`, `APP_SECRET`, `ALLOW_REGISTRATION`, and `TRUST_PROXY`. Any other [configuration](README.md#configuration) variable can be added under `environment:` in the compose file if you need it. To put an invisible Cloudflare Turnstile captcha on log in and sign up, set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (both are required; Cloudflare's always-pass test keys `1x00000000000000000000BB` and `1x0000000000000000000000000000000AA` work for trying it on localhost).

**Secret.** If `APP_SECRET` is empty, the app generates one on first run and stores it in the data volume (`data/.secret` inside the mount). For a fixed secret before first boot: `openssl rand -hex 32` (32+ characters). Changing `APP_SECRET` later signs everyone out and makes saved bank passwords unreadable.

**Private image.** If the GitHub package is private, run `docker login ghcr.io` with a token that has `read:packages` before `docker compose up`.

**Data.** The SQLite database (`app.db`) and scheduled backups live under `./data` on the host. **`APP_SECRET` / `data/.secret` must be stored separately from database backups** (another volume, password manager, or host path not copied with `backups/`). Backups contain password hashes and session data; encrypted bank logins need the same secret to decrypt.

Keep `.secret` out of automated backup jobs that only grab `data/backups/*.db`.

## Plain docker run

```bash
mkdir -p ./data
docker run -d --name ledger --restart unless-stopped \
  -p 3001:3001 --shm-size=1g \
  -v "$(pwd)/data:/data" \
  -e APP_URL=http://localhost:3001 \
  -e APP_SECRET=   # or your openssl rand -hex 32 value \
  ghcr.io/rainnny7/ledger:latest
```

Adjust `APP_URL`, `PUBLIC_URL`, `TRUST_PROXY`, and other env vars as needed (see [Configuration](README.md#configuration)).

## Bare metal

```bash
bun install
bunx playwright install chromium
cp .env.example .env
bun run build
bun run start
```

`bun run start` serves the app and API on `PORT` (default `3001`). For local development with hot reload, use `bun run dev` (API on `:3001`, Vite on `:5173` with `APP_URL=http://localhost:5173`).

Put production settings in `.env`: at minimum set `APP_URL` to the URL people use in the browser. Use `PUBLIC_URL` when invoice links or PayPal webhooks need a different public `https://` origin.

## Running as a systemd service

Example unit for a source install in `/opt/ledger`, running as user `ledger`:

```ini
[Unit]
Description=Ledger
After=network.target

[Service]
Type=simple
User=ledger
WorkingDirectory=/opt/ledger
EnvironmentFile=/opt/ledger/.env
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable with `systemctl enable --now ledger.service`. For Docker, prefer `docker compose` with `restart: unless-stopped` instead of wrapping the container in systemd, unless your policy requires it.

## Reverse proxy

Put TLS and your hostname in front of Ledger; set **`TRUST_PROXY=true`** so login rate limits use the client IP from `X-Forwarded-For` (only safe when untrusted clients cannot reach the app directly).

Set **`APP_URL`** to the public origin users open (e.g. `https://ledger.example.com`). Set **`PUBLIC_URL`** to the same value unless invoice share links or PayPal webhooks must use another public `https://` URL.

**Caddy** (automatic HTTPS):

```caddy
ledger.example.com {
    reverse_proxy localhost:3001
}
```

In `.env` on the Ledger host: `APP_URL=https://ledger.example.com`, `PUBLIC_URL=https://ledger.example.com`, `TRUST_PROXY=true`.

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name ledger.example.com;
    # ssl_certificate …

  location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use the same `APP_URL`, `PUBLIC_URL`, and `TRUST_PROXY` settings as above.

## Sign-ups and sharing

Ledger never verifies sign-up emails: whoever registers an address owns that account. Goals, subscriptions and jobs are shared by email, and the recipient has to accept the invitation (it shows who is inviting them) before they see anything. Even so, someone could register a colleague's address ahead of them and receive an invitation meant for the real person. Keep `ALLOW_REGISTRATION` off unless you trust everyone who can reach the server, and create accounts for the people you share with yourself.

## Backups and restore

Ledger backs up automatically once a day (and on demand):

- Files are SQLite copies in **`$DATA_DIR/backups/`** named `ledger-YYYY-MM-DDTHH-MM-SS.db`.
- The task keeps the newest **`BACKUPS_KEPT`** files (default **14**).
- Admins can download backups from **Admin → Tasks** (or trigger **Back up now**). Manual backups can include a note.

**Restore** (there is no one-click restore in the app):

1. Stop Ledger.
2. Replace `$DATA_DIR/app.db` with the downloaded backup file (keep a copy of the current `app.db` first).
3. Start Ledger with the **same `APP_SECRET`** (or the same `data/.secret`) as when the backup was taken; otherwise saved bank credentials cannot be decrypted. Store that secret outside the backup folder so a leaked `.db` file alone is not enough to read bank passwords.

For Docker, the database is `./data/app.db` on the host mount. Copy backups off the server regularly.

## Updating

**In-app notice (admins).** When `UPDATE_CHECK` is not `false`, the server polls GitHub’s latest release for `rainnny7/ledger` about every **6 hours** (cached). Admins see a banner with release notes and copy-paste upgrade commands. Set `UPDATE_CHECK=false` to disable. `LEDGER_INSTALL` defaults to `docker`; set `LEDGER_INSTALL=source` for a git checkout so the UI suggests source commands.

**Release channel (admins).** The Admin page has a **Release channel** selector. **Stable** follows the latest release (image tag `latest`). **Dev** follows the `dev` branch on GitHub; CI publishes it as `ghcr.io/rainnny7/ledger:dev`. The selector defaults to the channel you are running (the image’s `LEDGER_CHANNEL`, or the checked-out git branch for a source install) until an admin picks one. The update check and the commands shown follow the selected channel.

- **One-click switch** needs the Docker socket mounted (uncomment `/var/run/docker.sock:/var/run/docker.sock` in `docker-compose.yml`) and the container's default hostname (its id). Ledger then pulls the image and starts a short-lived helper that replaces the container with a copy running the new image (same settings, volumes, ports and networks), restoring the old one if something fails. **Mounting the socket gives Ledger host-level control of Docker; only do it if you accept that.**
- **Without the socket**, the page shows the same selector plus commands: set `image:` in `docker-compose.yml` to the tag shown, then `docker compose pull && docker compose up -d`.
- A later `docker compose up` goes back to the image tag in your compose file, so edit the file too if you want the channel to stick.

**Docker Compose:**

```bash
docker compose pull
docker compose up -d
```

**From source:**

```bash
git pull
bun install
bun run build
# restart the process (systemd, bun run start, etc.)
```

Your `./data` volume or `DATA_DIR` is preserved across upgrades.

## Unattended updates (Watchtower)

Watchtower can pull and recreate the container; **Ledger cannot replace its own Docker image from inside the app.**

Example alongside Ledger (adjust labels to taste):

```yaml
services:
    ledger:
        image: ghcr.io/rainnny7/ledger:latest
        # … your existing ledger service …

    watchtower:
        image: containrrr/watchtower
        volumes:
            - /var/run/docker.sock:/var/run/docker.sock
        command: --interval 86400 --cleanup ledger
```

Review release notes before auto-upgrading production; database migrations are forward-only and backups are still your responsibility.

## Email deliverability

Ledger sends mail (sign-in links, notifications and the monthly spending digest) through the SMTP server you set in Admin → Outbound Email. Whether it reaches an inbox depends on your domain's DNS, not on Ledger.

**Monthly spending digest.** Each person can opt in under Settings → Preferences (off by default). It needs outgoing email configured and `AI_API_KEY` set. Early each month, once a person's own calendar date reaches the new month, Ledger emails a summary of the month that just ended: totals, comparison with earlier months, category shifts, unusual charges and new or pricier subscriptions. All figures are computed by Ledger. Only aggregates and a few flagged items (merchant names and amounts, no account numbers and no full transaction lists) are sent to your AI provider (`AI_BASE_URL`), which writes the short commentary; if that call fails the email goes out without commentary. Every digest has an unsubscribe link and `List-Unsubscribe` headers (one-click, RFC 8058). The links use `PUBLIC_URL`, so set it to the address people can reach. Admin → Tasks → Send spending digests runs the check on demand, and "Send me a test digest now" in Preferences sends yourself last month's digest regardless of the schedule.

**Checklist.** Use a From address on a domain you control, then set up:

- **SPF.** Publish a TXT record on the From domain that lists your SMTP provider, e.g. `v=spf1 include:_spf.your-provider.com ~all`. Self-hosted relay: `v=spf1 ip4:YOUR.SERVER.IP ~all`.
- **DKIM.** Messages must be signed with a key whose public half is in DNS (`selector._domainkey.example.com`). Most providers (and your own mail server) sign for you; use theirs and leave Ledger's DKIM fields empty. If your SMTP server does not sign, generate a key (`openssl genrsa -out dkim.pem 2048`, then `openssl rsa -in dkim.pem -pubout`), publish the public key as a TXT record `v=DKIM1; k=rsa; p=<public key>`, and enter the domain, selector and private key in Admin → Outbound Email. Ledger stores the key encrypted with your `APP_SECRET`. Don't sign twice.
- **DMARC.** Publish `_dmarc.example.com` TXT, starting with `v=DMARC1; p=none; rua=mailto:you@example.com`, and tighten to `quarantine` once reports look clean. DMARC passes only when SPF or DKIM passes and its domain matches the From domain (alignment), so the From address, the SPF-checked envelope domain and the DKIM `d=` domain should all be on the same domain (or a subdomain of it).
- **PTR / reverse DNS.** If you send from your own server's IP, its reverse DNS must resolve to a hostname that resolves back to that IP, and ideally matches the name your server announces. Hosted providers handle this for you. Many home and cloud IPs are blocked outright; a provider relay is usually easier.
- **Test it.** Turn on the digest, press "Send me a test digest now", and send to a throwaway address from [mail-tester.com](https://www.mail-tester.com). It scores SPF, DKIM, DMARC, headers and content, and tells you what to fix.

## Troubleshooting

| Symptom                                            | What to try                                                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TD login hangs or Chromium crashes in Docker       | Confirm `shm_size: 1gb` (or `docker run --shm-size=1g`). Try `TD_HEADLESS=false` on a machine with a display, or `TD_BROWSER_CHANNEL=chrome` if Chrome is installed. |
| Port already in use                                | Change `PORT` and the published port mapping (`3001:3001`).                                                                                                          |
| Everyone logged out / saved bank passwords invalid | Usually a new or changed `APP_SECRET`. Restore `data/.secret` or the previous env value; otherwise re-enter bank credentials.                                        |
| PayPal webhooks never arrive                       | `PUBLIC_URL` must be a reachable public `https://` URL; reverse proxy must forward to Ledger.                                                                        |
| Rate limits wrong behind a proxy                   | Set `TRUST_PROXY=true` only when clients cannot bypass the proxy.                                                                                                    |
| Update check never shows a release                 | GitHub must allow the request. Use `UPDATE_CHECK=false` to silence failures.                                                                                         |

For app behaviour and bank connections, see the main [README](README.md).
