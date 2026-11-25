import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DATA_DIR } from './env.ts'

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

/** App tables (Better Auth manages its own user/session/account/verification tables). */
export function migrateAppTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_connection (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      institution TEXT NOT NULL,
      label TEXT NOT NULL,
      username_masked TEXT NOT NULL,
      credentials_enc TEXT,            -- AES-GCM encrypted {username,password}, only if user opted in
      browser_state_enc TEXT,          -- encrypted Playwright storage state (remembers device → fewer 2FA prompts)
      status TEXT NOT NULL DEFAULT 'active',
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_account (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES bank_connection(id) ON DELETE CASCADE,
      external_key TEXT NOT NULL,      -- stable key from the bank (masked number + name)
      name TEXT NOT NULL,
      type TEXT NOT NULL,              -- chequing | savings | credit | loan | investment | wallet | other
      number_masked TEXT,
      currency TEXT NOT NULL DEFAULT 'CAD',
      balance REAL,
      available REAL,
      overdraft_limit REAL,
      overdraft_used REAL,
      credit_limit REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (connection_id, external_key)
    );

    CREATE TABLE IF NOT EXISTS bank_transaction (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES bank_account(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,       -- dedupe key: date|description|amount|occurrence
      date TEXT NOT NULL,              -- YYYY-MM-DD
      description TEXT NOT NULL,
      amount REAL NOT NULL,            -- negative = money out
      running_balance REAL,
      pending INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (account_id, fingerprint)
    );

    CREATE INDEX IF NOT EXISTS idx_tx_account_date ON bank_transaction(account_id, date DESC);

    -- "Always file <merchant> under <category>" rules set from the transaction sheet.
    CREATE TABLE IF NOT EXISTS category_rule (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      merchant_key TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, merchant_key)
    );

    CREATE TABLE IF NOT EXISTS subscription (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CAD',
      cycle TEXT NOT NULL,             -- a preset (weekly … triennial) or every-<n>-<weeks|months|years>
      anchor_date TEXT NOT NULL,       -- a known billing date; next due rolls forward from it
      category TEXT NOT NULL DEFAULT 'subscriptions',
      account_id TEXT REFERENCES bank_account(id) ON DELETE SET NULL,
      merchant_key TEXT,               -- links to matching bank transactions
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sub_user ON subscription(user_id);

    -- Merchants the user dismissed from "detected recurring charges".
    CREATE TABLE IF NOT EXISTS subscription_dismissed (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      merchant_key TEXT NOT NULL,
      PRIMARY KEY (user_id, merchant_key)
    );

    -- Savings / pay-off goals and the partial payments logged toward them.
    CREATE TABLE IF NOT EXISTS goal (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'save',   -- save | payoff
      target REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CAD',
      target_date TEXT,                    -- YYYY-MM-DD, optional
      icon TEXT NOT NULL DEFAULT 'target',
      color TEXT NOT NULL DEFAULT 'sunset',
      notes TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goal_user ON goal(user_id);

    CREATE TABLE IF NOT EXISTS goal_payment (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
      amount REAL NOT NULL,                -- negative = withdrawn from the goal
      date TEXT NOT NULL,
      note TEXT,
      transaction_id TEXT REFERENCES bank_transaction(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_goal_payment_goal ON goal_payment(goal_id, date);

    -- Work-hours tracking for side jobs paid by the hour, in instalments.
    CREATE TABLE IF NOT EXISTS work_job (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rate REAL NOT NULL,                  -- per hour
      currency TEXT NOT NULL DEFAULT 'CAD',
      pay_amount REAL,                     -- usual instalment, e.g. 250 (optional)
      pay_every_days INTEGER,              -- how often instalments come, e.g. 7 (optional)
      color TEXT NOT NULL DEFAULT 'ocean',
      notes TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_job_user ON work_job(user_id);

    -- A bill: "done N hours since last pay, total is $X". Paid off in instalments.
    CREATE TABLE IF NOT EXISTS work_invoice (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES work_job(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      hours REAL NOT NULL,
      rate REAL NOT NULL,
      total REAL NOT NULL,                 -- usually hours × rate, but can be agreed differently
      counter_hours REAL,                  -- the time tracker's running total when billed, if used
      proof_url TEXT,                      -- screenshot of the tracker
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_invoice_job ON work_invoice(job_id, date);

    -- Shifts logged as you go; bundled into the next bill.
    CREATE TABLE IF NOT EXISTS work_entry (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES work_job(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      hours REAL NOT NULL,
      note TEXT,
      invoice_id TEXT REFERENCES work_invoice(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_entry_job ON work_entry(job_id, date);

    CREATE TABLE IF NOT EXISTS work_payment (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES work_invoice(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      transaction_id TEXT REFERENCES bank_transaction(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_work_payment_invoice ON work_payment(invoice_id, date);

    -- Invoices you send to clients. Line items, parties and the chosen payment methods are JSON.
    CREATE TABLE IF NOT EXISTS invoice (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,          -- the secret in the share link (/i/<token>)
      status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | void (paid is worked out from payments)
      template TEXT NOT NULL DEFAULT 'modern',
      theme TEXT NOT NULL DEFAULT 'professional',
      currency TEXT NOT NULL DEFAULT 'CAD',
      issue_date TEXT NOT NULL,
      due_date TEXT,
      from_json TEXT NOT NULL,             -- {name,email,phone,address,taxId}
      client_json TEXT NOT NULL,
      items_json TEXT NOT NULL,            -- [{description,quantity,unitPrice}]
      tax_rate REAL NOT NULL DEFAULT 0,    -- percent
      tax_label TEXT NOT NULL DEFAULT 'Tax',
      discount REAL NOT NULL DEFAULT 0,    -- flat amount off the subtotal
      notes TEXT,
      terms TEXT,
      methods_json TEXT NOT NULL DEFAULT '[]', -- ids of payment_method rows offered on the invoice
      work_invoice_id TEXT REFERENCES work_invoice(id) ON DELETE SET NULL, -- billed from a Work bill: its payments count
      sent_at TEXT,
      viewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_user ON invoice(user_id, issue_date);

    CREATE TABLE IF NOT EXISTS invoice_payment (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      method TEXT,
      note TEXT,
      transaction_id TEXT REFERENCES bank_transaction(id) ON DELETE SET NULL,
      external_id TEXT UNIQUE,             -- PayPal capture id, so a webhook and a redirect don't count it twice
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_payment_invoice ON invoice_payment(invoice_id, date);

    -- Ways clients can pay you (e-Transfer email, PayPal.me, a crypto address…), reused across invoices.
    CREATE TABLE IF NOT EXISTS payment_method (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      fields_json TEXT NOT NULL DEFAULT '{}',
      is_default INTEGER NOT NULL DEFAULT 0, -- ticked on new invoices
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payment_method_user ON payment_method(user_id);

    -- Your own details and defaults for new invoices.
    CREATE TABLE IF NOT EXISTS invoice_profile (
      user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
      json TEXT NOT NULL
    );

    -- PayPal webhook deliveries already handled (PayPal retries, so the same one can arrive twice).
    CREATE TABLE IF NOT EXISTS paypal_webhook_event (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES bank_connection(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- People you share with. Email is lowercased; name is your label for them.
    CREATE TABLE IF NOT EXISTS contact (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, email)
    );
    -- A goal, subscription or job shared by its owner with another account ('view' or 'edit').
    CREATE TABLE IF NOT EXISTS share (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      permission TEXT NOT NULL DEFAULT 'view',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kind, item_id, recipient_id)
    );
    CREATE INDEX IF NOT EXISTS share_recipient ON share (recipient_id, kind);
    -- Instance-wide switches an admin can flip (e.g. registration_open).
    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  addColumn('bank_transaction', 'category_override', 'TEXT')
  addColumn('bank_transaction', 'note', 'TEXT')
  // Earliest date a full history read has reached (null → do a full backfill next sync).
  addColumn('bank_account', 'history_from', 'TEXT')
  // Direct deposit numbers + limits (encrypted JSON: they include the full account number).
  addColumn('bank_account', 'details_enc', 'TEXT')
  addColumn('bank_account', 'details_updated_at', 'TEXT')
  // PayPal: the webhook registered on the user's REST app for instant updates.
  addColumn('bank_connection', 'webhook_id', 'TEXT')
  addColumn('bank_connection', 'webhook_at', 'TEXT')
  // A PayPal capture id on bill payments too, so checkout payments are only counted once.
  addColumn('work_payment', 'external_id', 'TEXT')
  // Paid in one currency, arrived in another (e.g. billed in USD, deposited as CAD).
  addColumn('work_payment', 'received_amount', 'REAL')
  addColumn('work_payment', 'received_currency', 'TEXT')
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_work_payment_external ON work_payment(external_id) WHERE external_id IS NOT NULL`)
}

export function getSetting(key: string): string | null {
  const row = db.prepare(`SELECT value FROM app_setting WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  db.prepare(`INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(key, value)
}

function addColumn(table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}
