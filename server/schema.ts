/**
 * The app's tables, and the one-way migration that moved every money column from REAL dollars to
 * INTEGER cents. These are functions of a connection (not of the app's global `db`) so the
 * migration can be tested against a throwaway database.
 */

import { toCents } from "../shared/money.ts"

type Param = string | number | bigint | null

export interface Statement {
  all(...params: Param[]): unknown[]
  get(...params: Param[]): unknown
  run(...params: Param[]): unknown
}
export interface Conn {
  exec(sql: string): void
  prepare(sql: string): Statement
}

interface CentsOptions {
  /** Column may be NULL (e.g. a balance the bank didn't report). */
  nullable?: boolean
  /** Smallest value the app ever writes, as an invariant (e.g. a budget is never negative). */
  min?: number
  default?: number
}

/**
 * An INTEGER-cents column. The CHECK is what gives a true integer guarantee: INTEGER affinity
 * alone would quietly keep a stray 12.34 as a REAL, so a writer that forgot `toCents` fails loudly.
 */
const cents = (name: string, o: CentsOptions = {}) =>
  [
    `${name} INTEGER`,
    o.nullable ? "" : "NOT NULL",
    o.default === undefined ? "" : `DEFAULT ${o.default}`,
    `CHECK (typeof(${name}) IN (${o.nullable ? "'integer', 'null'" : "'integer'"})${
      o.min === undefined ? "" : ` AND ${name} >= ${o.min}`
    })`,
  ]
    .filter(Boolean)
    .join(" ")

interface MoneyTable {
  name: string
  /** Columns that hold money (cents after the migration). */
  columns: string[]
  ddl: (name: string) => string
}

/** Every table with a money column. The DDL is the single source for fresh databases and rebuilds. */
export const MONEY_TABLES: MoneyTable[] = [
  {
    name: "bank_account",
    columns: [
      "balance",
      "available",
      "overdraft_limit",
      "overdraft_used",
      "credit_limit",
    ],
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES bank_connection(id) ON DELETE CASCADE,
      external_key TEXT NOT NULL,      -- stable key from the bank (masked number + name)
      name TEXT NOT NULL,
      type TEXT NOT NULL,              -- chequing | savings | credit | loan | investment | wallet | other
      number_masked TEXT,
      currency TEXT NOT NULL DEFAULT 'CAD',
      ${cents("balance", { nullable: true })},
      ${cents("available", { nullable: true })},
      ${cents("overdraft_limit", { nullable: true })},
      ${cents("overdraft_used", { nullable: true })},
      ${cents("credit_limit", { nullable: true })},
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      history_from TEXT,               -- earliest date a full history read has reached (null → full backfill next sync)
      details_enc TEXT,                -- direct deposit numbers + limits (encrypted JSON: includes the full account number)
      details_updated_at TEXT,
      UNIQUE (connection_id, external_key)
    )`,
  },
  {
    name: "bank_transaction",
    columns: ["amount", "running_balance"],
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES bank_account(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,       -- dedupe key: date|description|amount|occurrence
      date TEXT NOT NULL,              -- YYYY-MM-DD
      description TEXT NOT NULL,
      ${cents("amount")},              -- negative = money out
      ${cents("running_balance", { nullable: true })},
      pending INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      category_override TEXT,
      note TEXT,
      tax_tag TEXT,                    -- business | personal, for the tax report
      UNIQUE (account_id, fingerprint)
    )`,
  },
  {
    name: "subscription",
    columns: ["amount"],
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      ${cents("amount", { min: 0 })},
      currency TEXT NOT NULL DEFAULT 'CAD',
      cycle TEXT NOT NULL,             -- a preset (weekly … triennial) or every-<n>-<weeks|months|years>
      anchor_date TEXT NOT NULL,       -- a known billing date; next due rolls forward from it
      category TEXT NOT NULL DEFAULT 'subscriptions',
      account_id TEXT REFERENCES bank_account(id) ON DELETE SET NULL,
      merchant_key TEXT,               -- links to matching bank transactions
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    name: "budget",
    columns: ["amount"],
    // A monthly spending limit per category, in the user's home currency.
    ddl: (t) => `CREATE TABLE ${t} (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      ${cents("amount", { min: 0 })},
      currency TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, category)
    )`,
  },
  {
    name: "goal",
    columns: ["target"],
    // Savings / pay-off goals and the partial payments logged toward them.
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'save',   -- save | payoff
      ${cents("target", { min: 0 })},
      currency TEXT NOT NULL DEFAULT 'CAD',
      target_date TEXT,                    -- YYYY-MM-DD, optional
      icon TEXT NOT NULL DEFAULT 'target',
      color TEXT NOT NULL DEFAULT 'sunset',
      notes TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    name: "goal_payment",
    columns: ["amount"],
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goal(id) ON DELETE CASCADE,
      ${cents("amount")},                  -- negative = withdrawn from the goal
      date TEXT NOT NULL,
      note TEXT,
      transaction_id TEXT REFERENCES bank_transaction(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    name: "work_job",
    columns: ["rate", "pay_amount"],
    // Work-hours tracking for side jobs paid by the hour, in instalments.
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      ${cents("rate", { min: 0 })},        -- per hour
      currency TEXT NOT NULL DEFAULT 'CAD',
      ${cents("pay_amount", { nullable: true, min: 0 })}, -- usual instalment, e.g. 250 (optional)
      pay_every_days INTEGER,              -- how often instalments come, e.g. 7 (optional)
      color TEXT NOT NULL DEFAULT 'ocean',
      notes TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    name: "work_invoice",
    columns: ["rate", "total"],
    // A bill: "done N hours since last pay, total is $X". Paid off in instalments.
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES work_job(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      hours REAL NOT NULL,
      ${cents("rate", { min: 0 })},
      ${cents("total", { min: 0 })},       -- usually hours × rate, but can be agreed differently
      counter_hours REAL,                  -- the time tracker's running total when billed, if used
      proof_url TEXT,                      -- screenshot of the tracker
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    name: "work_payment",
    columns: ["amount", "received_amount"],
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES work_invoice(id) ON DELETE CASCADE,
      ${cents("amount")},
      date TEXT NOT NULL,
      note TEXT,
      transaction_id TEXT REFERENCES bank_transaction(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      external_id TEXT,                    -- PayPal capture id, so checkout payments are only counted once
      ${cents("received_amount", { nullable: true })}, -- paid in one currency, arrived in another
      received_currency TEXT
    )`,
  },
  {
    name: "invoice",
    columns: ["discount"],
    // Invoices you send to clients. Line items, parties and the chosen payment methods are JSON.
    ddl: (t) => `CREATE TABLE ${t} (
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
      items_json TEXT NOT NULL,            -- [{description,quantity,unitPriceCents}]
      tax_rate REAL NOT NULL DEFAULT 0,    -- percent
      tax_label TEXT NOT NULL DEFAULT 'Tax',
      ${cents("discount", { min: 0, default: 0 })}, -- flat amount off the subtotal
      notes TEXT,
      terms TEXT,
      methods_json TEXT NOT NULL DEFAULT '[]', -- ids of payment_method rows offered on the invoice
      work_invoice_id TEXT REFERENCES work_invoice(id) ON DELETE SET NULL, -- billed from a Work bill: its payments count
      sent_at TEXT,
      viewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
  {
    name: "invoice_payment",
    columns: ["amount"],
    ddl: (t) => `CREATE TABLE ${t} (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
      ${cents("amount")},
      date TEXT NOT NULL,
      method TEXT,
      note TEXT,
      transaction_id TEXT REFERENCES bank_transaction(id) ON DELETE SET NULL,
      external_id TEXT UNIQUE,             -- PayPal capture id, so a webhook and a redirect don't count it twice
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  },
]

const PLAIN_TABLES = `
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

    -- "Always file <merchant> under <category>" rules set from the transaction sheet.
    CREATE TABLE IF NOT EXISTS category_rule (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      merchant_key TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, merchant_key)
    );

    -- Charges the user counted toward a subscription by hand (a different merchant name or price
    -- than the plan's). Each one also teaches the plan to match later charges like it.
    CREATE TABLE IF NOT EXISTS subscription_charge (
      subscription_id TEXT NOT NULL REFERENCES subscription(id) ON DELETE CASCADE,
      transaction_id TEXT NOT NULL REFERENCES bank_transaction(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (subscription_id, transaction_id)
    );

    -- "Always tag <merchant> as business / personal" rules, for the tax report.
    CREATE TABLE IF NOT EXISTS tax_rule (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      merchant_key TEXT NOT NULL,
      tag TEXT NOT NULL,               -- business | personal
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, merchant_key)
    );

    -- Merchants the user dismissed from "detected recurring charges".
    CREATE TABLE IF NOT EXISTS subscription_dismissed (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      merchant_key TEXT NOT NULL,
      PRIMARY KEY (user_id, merchant_key)
    );

    -- Advisor tips the user hid: until a date (snoozed) or for good (until NULL).
    CREATE TABLE IF NOT EXISTS advice_dismissed (
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      tip_id TEXT NOT NULL,
      until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, tip_id)
    );

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
    -- It's an invitation ('pending') until the recipient accepts; only accepted shares grant access.
    CREATE TABLE IF NOT EXISTS share (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      item_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      permission TEXT NOT NULL DEFAULT 'view',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (kind, item_id, recipient_id)
    );
    -- Instance-wide switches an admin can flip (e.g. registration_open).
    CREATE TABLE IF NOT EXISTS app_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
`

/** Indexes live apart from the tables: a rebuild drops a table's indexes, so they're always re-run. */
const INDEXES = `
    CREATE INDEX IF NOT EXISTS idx_tx_account_date ON bank_transaction(account_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_tx_account_date_id ON bank_transaction(account_id, date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_connection_user ON bank_connection(user_id);
    CREATE INDEX IF NOT EXISTS idx_sub_user ON subscription(user_id);
    CREATE INDEX IF NOT EXISTS idx_sub_charge_tx ON subscription_charge(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_goal_user ON goal(user_id);
    CREATE INDEX IF NOT EXISTS idx_goal_payment_goal ON goal_payment(goal_id, date);
    CREATE INDEX IF NOT EXISTS idx_work_job_user ON work_job(user_id);
    CREATE INDEX IF NOT EXISTS idx_work_invoice_job ON work_invoice(job_id, date);
    CREATE INDEX IF NOT EXISTS idx_work_entry_job ON work_entry(job_id, date);
    CREATE INDEX IF NOT EXISTS idx_work_payment_invoice ON work_payment(invoice_id, date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_work_payment_external ON work_payment(external_id) WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_invoice_user ON invoice(user_id, issue_date);
    CREATE INDEX IF NOT EXISTS idx_invoice_payment_invoice ON invoice_payment(invoice_id, date);
    CREATE INDEX IF NOT EXISTS idx_payment_method_user ON payment_method(user_id);
    CREATE INDEX IF NOT EXISTS share_recipient ON share (recipient_id, kind);
`

const columnsOf = (conn: Conn, table: string) =>
  conn.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
    type: string
  }[]

/** Creates anything missing, upgrades old money columns to cents, then (re)creates indexes. */
export function createSchema(conn: Conn) {
  conn.exec(PLAIN_TABLES)
  for (const t of MONEY_TABLES)
    conn.exec(
      t.ddl(t.name).replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")
    )
  migrateMoneyToCents(conn)
  conn.exec(INDEXES)
}

/**
 * One-way: tables that still declare a money column as REAL are rebuilt with INTEGER cents
 * (`ROUND(x * 100)`), keeping every row, key and foreign-key link. Invoice line items inside
 * `items_json` are converted in the same transaction. A rebuilt table has INTEGER columns, so a
 * second run finds nothing to do. Foreign keys are switched off for the rebuild (dropping a parent
 * table would otherwise cascade-delete its children) and checked before committing.
 */
export function migrateMoneyToCents(conn: Conn) {
  const stale = MONEY_TABLES.filter((t) => {
    const cols = columnsOf(conn, t.name)
    return t.columns.some(
      (c) => cols.find((x) => x.name === c)?.type.toUpperCase() !== "INTEGER"
    )
  })
  if (stale.length === 0) return

  conn.exec("PRAGMA foreign_keys = OFF")
  try {
    conn.exec("BEGIN")
    try {
      for (const t of stale) rebuildAsCents(conn, t)
      const broken = conn.prepare("PRAGMA foreign_key_check").all()
      if (broken.length)
        throw new Error("Money migration left broken foreign keys")
      conn.exec("COMMIT")
    } catch (e) {
      conn.exec("ROLLBACK")
      throw e
    }
  } finally {
    conn.exec("PRAGMA foreign_keys = ON")
  }
}

function rebuildAsCents(conn: Conn, t: MoneyTable) {
  const tmp = `${t.name}__cents`
  const old = new Set(columnsOf(conn, t.name).map((c) => c.name))
  conn.exec(t.ddl(tmp))
  const shared = columnsOf(conn, tmp)
    .map((c) => c.name)
    .filter((c) => old.has(c))
  const select = shared.map((c) =>
    t.columns.includes(c) ? `CAST(ROUND(${c} * 100) AS INTEGER)` : c
  )
  conn.exec(
    `INSERT INTO ${tmp} (${shared.join(", ")}) SELECT ${select.join(", ")} FROM ${t.name}`
  )
  conn.exec(`DROP TABLE ${t.name}`)
  conn.exec(`ALTER TABLE ${tmp} RENAME TO ${t.name}`)
  if (t.name === "invoice") itemsToCents(conn)
}

/** `items_json` line items: `unitPrice` (dollars) → `unitPriceCents`. */
function itemsToCents(conn: Conn) {
  const rows = conn
    .prepare("SELECT id, items_json AS json FROM invoice")
    .all() as {
    id: string
    json: string
  }[]
  const update = conn.prepare("UPDATE invoice SET items_json = ? WHERE id = ?")
  for (const r of rows) {
    const items = JSON.parse(r.json) as {
      unitPrice?: number
      unitPriceCents?: number
    }[]
    const converted = items.map(({ unitPrice, ...item }) => ({
      ...item,
      unitPriceCents: item.unitPriceCents ?? toCents(unitPrice ?? 0),
    }))
    update.run(JSON.stringify(converted), r.id)
  }
}
