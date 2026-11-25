/**
 * Imports uploaded TD statements (PDFs, or .zip archives of them) into the user's TD accounts.
 * Fills in history older than the 18 months EasyWeb shows; rows use the same fingerprint as a
 * sync, so uploading the same statement twice (or one a sync already covered) adds nothing.
 */
import { randomUUID } from 'node:crypto'
import { unzipSync } from 'fflate'
import { getDocumentProxy } from 'unpdf'
import { db } from '../db.ts'
import { guessAccountType } from './td/parse.ts'
import { NotATdStatement, parseTdStatement, type TdStatement, type TextItem } from './td/statement.ts'

const MAX_FILES = 500
const MAX_PDF_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 300 * 1024 * 1024

export interface UploadedFile {
  name: string
  bytes: Uint8Array
}

export interface FileResult {
  name: string
  status: 'imported' | 'duplicate' | 'error'
  message?: string
  accountNumber?: string
  from?: string
  to?: string
}

export interface AccountResult {
  accountId: string
  name: string
  numberMasked: string
  created: boolean
  statements: number
  added: number
  /** Rows already there (an earlier upload, or a sync that covered those dates). */
  existing: number
  from: string
  to: string
  /** Stretches no uploaded statement covers, between statements or up to where synced history starts. */
  gaps: { from: string; to: string }[]
}

export interface ImportResult {
  files: FileResult[]
  accounts: AccountResult[]
}

/** Unpacks archives and keeps the PDFs. Archives are size-checked before anything is inflated. */
export function collectPdfs(uploads: UploadedFile[]): { pdfs: UploadedFile[]; rejected: FileResult[] } {
  const pdfs: UploadedFile[] = []
  const rejected: FileResult[] = []
  let total = 0
  let count = 0
  for (const u of uploads) {
    if (/\.pdf$/i.test(u.name)) {
      if (u.bytes.byteLength > MAX_PDF_BYTES) rejected.push({ name: u.name, status: 'error', message: 'Too large for a statement' })
      else if (++count > MAX_FILES) rejected.push({ name: u.name, status: 'error', message: 'Too many files in one upload' })
      else pdfs.push(u)
      continue
    }
    if (!/\.zip$/i.test(u.name)) {
      rejected.push({ name: u.name, status: 'error', message: 'Not a PDF or .zip file' })
      continue
    }
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(u.bytes, {
        filter: (f) => {
          if (!/\.pdf$/i.test(f.name) || /(^|\/)(__MACOSX|\.)/.test(f.name)) return false
          if (f.originalSize > MAX_PDF_BYTES) {
            rejected.push({ name: f.name, status: 'error', message: 'Too large for a statement' })
            return false
          }
          total += f.originalSize
          if (total > MAX_TOTAL_BYTES || ++count > MAX_FILES) throw new Error('Archive is too large')
          return true
        },
      })
    } catch (e) {
      rejected.push({ name: u.name, status: 'error', message: (e as Error).message === 'Archive is too large' ? 'Archive is too large' : 'Could not open this archive' })
      continue
    }
    for (const [name, bytes] of Object.entries(entries)) pdfs.push({ name: name.split('/').pop() ?? name, bytes })
  }
  return { pdfs, rejected }
}

async function pdfText(bytes: Uint8Array): Promise<TextItem[][]> {
  const pdf = await getDocumentProxy(bytes)
  try {
    const pages: TextItem[][] = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const content = await (await pdf.getPage(p)).getTextContent()
      pages.push(
        content.items
          .filter((i) => 'str' in i)
          .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width })),
      )
    }
    return pages
  } finally {
    await pdf.loadingTask.destroy()
  }
}

/** EasyWeb's download name carries the account's name the way EasyWeb shows it, e.g. "TD_STUDENT_CHEQUING_ACCOUNT_3203-…". */
function accountName(fileName: string, s: TdStatement) {
  const fromFile = fileName.match(/^(TD_[A-Z_]+?)_\d{4}-\d{7}_/)?.[1]
  return fromFile ? fromFile.replace(/_/g, ' ') : `TD ${s.accountType || 'BANK'} ACCOUNT`.replace(/\s+/g, ' ')
}

const last4 = (s: string | null) => (s ?? '').replace(/\D/g, '').slice(-4)

const dayAfter = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * @param connectionId  TD connection to put accounts it doesn't already have under; defaults to
 *                      the user's first TD connection, or a new upload-only one.
 */
export async function importStatements(userId: string, uploads: UploadedFile[], connectionId?: string): Promise<ImportResult> {
  const { pdfs, rejected } = collectPdfs(uploads)
  const files: FileResult[] = [...rejected]
  const parsed: { file: UploadedFile; statement: TdStatement }[] = []
  const seen = new Set<string>()

  for (const file of pdfs.sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const statement = parseTdStatement(await pdfText(file.bytes))
      const key = `${statement.accountNumber}|${statement.from}|${statement.to}`
      const info = { accountNumber: statement.accountNumber, from: statement.from, to: statement.to }
      if (seen.has(key)) {
        files.push({ name: file.name, status: 'duplicate', message: 'Same statement as another file', ...info })
        continue
      }
      seen.add(key)
      parsed.push({ file, statement })
      files.push({
        name: file.name,
        status: 'imported',
        message: statement.mismatch === null ? undefined : `Totals are off by $${Math.abs(statement.mismatch).toFixed(2)}; check this one`,
        ...info,
      })
    } catch (e) {
      files.push({
        name: file.name,
        status: 'error',
        message: e instanceof NotATdStatement ? e.message : 'Could not read this PDF',
      })
    }
  }

  const byAccount = new Map<string, { file: UploadedFile; statement: TdStatement }[]>()
  for (const p of parsed) byAccount.set(p.statement.accountNumber, [...(byAccount.get(p.statement.accountNumber) ?? []), p])

  const accounts: AccountResult[] = []
  if (!byAccount.size) return { files, accounts }

  const tdAccounts = db
    .prepare(
      `SELECT a.id, a.name, a.number_masked AS numberMasked, a.type, a.history_from AS historyFrom
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE c.user_id = ? AND c.institution = 'td' AND a.type <> 'credit'`,
    )
    .all(userId) as { id: string; name: string; numberMasked: string | null; type: string; historyFrom: string | null }[]

  db.exec('BEGIN')
  try {
    let target = connectionId
      ? (db.prepare(`SELECT id FROM bank_connection WHERE id = ? AND user_id = ? AND institution = 'td'`).get(connectionId, userId) as
          | { id: string }
          | undefined)?.id
      : undefined
    const targetConnection = () => {
      target ??= (
        db.prepare(`SELECT id FROM bank_connection WHERE user_id = ? AND institution = 'td' ORDER BY created_at LIMIT 1`).get(userId) as
          | { id: string }
          | undefined
      )?.id
      if (!target) {
        target = randomUUID()
        db.prepare(
          `INSERT INTO bank_connection (id, user_id, institution, label, username_masked) VALUES (?, ?, 'td', 'TD EasyWeb', 'Uploaded statements')`,
        ).run(target, userId)
      }
      return target
    }

    const insertTx = db.prepare(
      `INSERT INTO bank_transaction (id, account_id, fingerprint, date, description, amount, running_balance, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT (account_id, fingerprint) DO NOTHING`,
    )

    for (const [number, list] of byAccount) {
      list.sort((a, b) => a.statement.from.localeCompare(b.statement.from))
      const newest = list.at(-1)!.statement
      const numberMasked = `••••${last4(number)}`
      let account = tdAccounts.find((a) => last4(a.numberMasked) === last4(number))
      const created = !account
      if (!account) {
        const name = accountName(list[0].file.name, newest)
        const type = guessAccountType(name)
        const id = randomUUID()
        const balance = newest.closingBalance
        db.prepare(
          `INSERT INTO bank_account (id, connection_id, external_key, name, type, number_masked, currency, balance, overdraft_used)
           VALUES (?, ?, ?, ?, ?, ?, 'CAD', ?, ?)`,
        ).run(id, targetConnection(), `${name.toLowerCase()}|${numberMasked}`, name, type, numberMasked, balance, balance === null ? null : Math.max(0, -balance))
        account = { id, name, numberMasked, type, historyFrom: null }
        tdAccounts.push(account)
      }

      let added = 0
      let existing = 0
      const occurrences = new Map<string, number>()
      for (const { statement } of list) {
        for (const t of statement.transactions) {
          const base = `${t.date}|${t.description.toLowerCase()}|${t.amount.toFixed(2)}|c`
          const n = occurrences.get(base) ?? 0
          occurrences.set(base, n + 1)
          // A sync has read every day from historyFrom on; its rows win there.
          if (account.historyFrom && t.date >= account.historyFrom) {
            existing++
            continue
          }
          const r = insertTx.run(randomUUID(), account.id, `${base}|${n}`, t.date, t.description, t.amount, t.runningBalance)
          if (Number(r.changes) > 0) added++
          else existing++
        }
      }

      const gaps: AccountResult['gaps'] = []
      for (let i = 1; i < list.length; i++) {
        const prevEnd = list[i - 1].statement.to
        const start = list[i].statement.from
        if (start > prevEnd) gaps.push({ from: dayAfter(prevEnd), to: start })
      }
      if (account.historyFrom && newest.to < account.historyFrom) gaps.push({ from: dayAfter(newest.to), to: account.historyFrom })

      accounts.push({
        accountId: account.id,
        name: account.name,
        numberMasked: account.numberMasked ?? numberMasked,
        created,
        statements: list.length,
        added,
        existing,
        from: list[0].statement.from,
        to: newest.to,
        gaps,
      })
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return { files, accounts }
}
