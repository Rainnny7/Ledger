/**
 * Imports uploaded TD statements (PDFs, or .zip archives of them) into the user's TD accounts.
 * Fills in history older than the 18 months EasyWeb shows; rows use the same fingerprint as a
 * sync, so uploading the same statement twice (or one a sync already covered) adds nothing.
 */
import { randomUUID } from "node:crypto"
import { archiveErrorMessage, unzipPdfEntries } from "./unzip-pdfs.ts"
import { getDocumentProxy } from "unpdf"
import { toCents, toCentsOrNull } from "@ledger/shared/money"
import { and, asc, eq, ne } from "drizzle-orm"
import { db } from "../db/connection.ts"
import {
	bankAccount,
	bankConnection,
	bankTransaction,
} from "../db/schema/index.ts"
import { isoDate } from "../http/validation.ts"
import { validateStatementRow } from "./statement-rows.ts"
import { uploadKindForName, uploadKindFromBytes } from "./upload-bytes.ts"
import { guessAccountType } from "./td/parse.ts"
import {
	NotATdStatement,
	parseTdStatement,
	type TdStatement,
	type TextItem,
} from "./td/statement.ts"

const MAX_FILES = 500
const MAX_PDF_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 300 * 1024 * 1024

/** Shape of UploadedFile as stored and returned by the API. */
export interface UploadedFile {
	name: string
	bytes: Uint8Array
}

/** Shape of FileResult as stored and returned by the API. */
export interface FileResult {
	name: string
	status: "imported" | "duplicate" | "error"
	message?: string
	accountNumber?: string
	from?: string
	to?: string
}

/** Shape of AccountResult as stored and returned by the API. */
export interface AccountResult {
	accountId: string
	name: string
	numberMasked: string
	created: boolean
	statements: number
	added: number
	/** Rows already there (an earlier upload, or a sync that covered those dates). */
	existing: number
	/** Parsed rows that failed validation and were not imported. */
	skipped: number
	from: string
	to: string
	/** Stretches no uploaded statement covers, between statements or up to where synced history starts. */
	gaps: { from: string; to: string }[]
}

/** Shape of ImportResult as stored and returned by the API. */
export interface ImportResult {
	files: FileResult[]
	accounts: AccountResult[]
}

/** Unpacks archives and keeps the PDFs. Archives are size-checked before anything is inflated. */
export function collectPdfs(uploads: UploadedFile[]): {
	pdfs: UploadedFile[]
	rejected: FileResult[]
} {
	const pdfs: UploadedFile[] = []
	const rejected: FileResult[] = []
	let total = 0
	let count = 0
	for (const upload of uploads) {
		const kind = uploadKindFromBytes(upload.bytes)
		if (/\.pdf$/i.test(upload.name)) {
			if (kind !== "pdf") {
				rejected.push({
					name: upload.name,
					status: "error",
					message: "File is not a PDF",
				})
				continue
			}
			if (upload.bytes.byteLength > MAX_PDF_BYTES) {
				rejected.push({
					name: upload.name,
					status: "error",
					message: "Too large for a statement",
				})
			} else if (++count > MAX_FILES) {
				rejected.push({
					name: upload.name,
					status: "error",
					message: "Too many files in one upload",
				})
			} else {
				pdfs.push(upload)
			}
			continue
		}
		if (!/\.zip$/i.test(upload.name)) {
			rejected.push({
				name: upload.name,
				status: "error",
				message: "Not a PDF or .zip file",
			})
			continue
		}
		if (uploadKindForName(upload.name) !== "zip" || kind !== "zip") {
			rejected.push({
				name: upload.name,
				status: "error",
				message: "File is not a .zip archive",
			})
			continue
		}
		const archiveCounters = { total, count }
		let entries: Record<string, Uint8Array>
		try {
			entries = unzipPdfEntries(
				upload.bytes,
				{
					maxPdfBytes: MAX_PDF_BYTES,
					maxTotalBytes: MAX_TOTAL_BYTES,
					maxFiles: MAX_FILES,
				},
				archiveCounters,
				(name, message) => {
					rejected.push({
						name,
						status: "error",
						message,
					})
				}
			)
		} catch (error) {
			total = archiveCounters.total
			count = archiveCounters.count
			rejected.push({
				name: upload.name,
				status: "error",
				message: archiveErrorMessage(error),
			})
			continue
		}
		total = archiveCounters.total
		count = archiveCounters.count
		for (const [name, bytes] of Object.entries(entries)) {
			if (uploadKindFromBytes(bytes) !== "pdf") {
				rejected.push({
					name,
					status: "error",
					message: "Archive entry is not a PDF",
				})
				continue
			}
			pdfs.push({ name: name.split("/").pop() ?? name, bytes })
		}
	}
	return { pdfs, rejected }
}

async function pdfText(bytes: Uint8Array): Promise<TextItem[][]> {
	const pdf = await getDocumentProxy(bytes)
	try {
		const pages: TextItem[][] = []
		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
			const content = await (
				await pdf.getPage(pageNumber)
			).getTextContent()
			pages.push(
				content.items
					.filter((i) => "str" in i)
					.map((i) => ({
						str: i.str,
						x: i.transform[4],
						y: i.transform[5],
						width: i.width,
					}))
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
	return fromFile
		? fromFile.replace(/_/g, " ")
		: `TD ${s.accountType || "BANK"} ACCOUNT`.replace(/\s+/g, " ")
}

const last4 = (value: string | null) =>
	(value ?? "").replace(/\D/g, "").slice(-4)

const dayAfter = (iso: string) => {
	const date = new Date(`${iso}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + 1)
	return date.toISOString().slice(0, 10)
}

/**
 * @param connectionId  TD connection to put accounts it doesn't already have under; defaults to
 *                      the user's first TD connection, or a new upload-only one.
 */
export async function importStatements(
	userId: string,
	uploads: UploadedFile[],
	connectionId?: string
): Promise<ImportResult> {
	const { pdfs, rejected } = collectPdfs(uploads)
	const files: FileResult[] = [...rejected]
	const parsed: { file: UploadedFile; statement: TdStatement }[] = []
	const seen = new Set<string>()

	// One file at a time, in name order: each PDF is held open in memory while it's read, and the
	// first copy of a duplicate statement is the one kept.
	for (const file of pdfs.toSorted((left, right) =>
		left.name.localeCompare(right.name)
	)) {
		try {
			const statement = parseTdStatement(await pdfText(file.bytes))
			const key = `${statement.accountNumber}|${statement.from}|${statement.to}`
			const info = {
				accountNumber: statement.accountNumber,
				from: statement.from,
				to: statement.to,
			}
			if (seen.has(key)) {
				files.push({
					name: file.name,
					status: "duplicate",
					message: "Same statement as another file",
					...info,
				})
				continue
			}
			seen.add(key)
			parsed.push({ file, statement })
			files.push({
				name: file.name,
				status: "imported",
				message:
					statement.mismatch === null
						? undefined
						: `Totals are off by $${Math.abs(statement.mismatch).toFixed(2)}; check this one`,
				...info,
			})
		} catch (error) {
			files.push({
				name: file.name,
				status: "error",
				message:
					error instanceof NotATdStatement
						? error.message
						: "Could not read this PDF",
			})
		}
	}

	const byAccount = new Map<
		string,
		{ file: UploadedFile; statement: TdStatement }[]
	>()
	for (const parsedFile of parsed) {
		byAccount.set(parsedFile.statement.accountNumber, [
			...(byAccount.get(parsedFile.statement.accountNumber) ?? []),
			parsedFile,
		])
	}

	const accounts: AccountResult[] = []
	if (!byAccount.size) {
		return { files, accounts }
	}

	const tdAccounts: {
		id: string
		name: string
		numberMasked: string | null
		type: string
		historyFrom: string | null
	}[] = db
		.select({
			id: bankAccount.id,
			name: bankAccount.name,
			numberMasked: bankAccount.numberMasked,
			type: bankAccount.type,
			historyFrom: bankAccount.historyFrom,
		})
		.from(bankAccount)
		.innerJoin(
			bankConnection,
			eq(bankConnection.id, bankAccount.connectionId)
		)
		.where(
			and(
				eq(bankConnection.userId, userId),
				eq(bankConnection.institution, "td"),
				ne(bankAccount.type, "credit")
			)
		)
		.all()

	db.transaction((tx) => {
		let target = connectionId
			? tx
					.select({ id: bankConnection.id })
					.from(bankConnection)
					.where(
						and(
							eq(bankConnection.id, connectionId),
							eq(bankConnection.userId, userId),
							eq(bankConnection.institution, "td")
						)
					)
					.get()?.id
			: undefined
		const targetConnection = () => {
			target ??= tx
				.select({ id: bankConnection.id })
				.from(bankConnection)
				.where(
					and(
						eq(bankConnection.userId, userId),
						eq(bankConnection.institution, "td")
					)
				)
				.orderBy(asc(bankConnection.createdAt))
				.limit(1)
				.get()?.id
			if (!target) {
				target = randomUUID()
				tx.insert(bankConnection)
					.values({
						id: target,
						userId,
						institution: "td",
						label: "TD EasyWeb",
						usernameMasked: "Uploaded statements",
					})
					.run()
			}
			return target
		}

		for (const [number, unsorted] of byAccount) {
			const list = unsorted.toSorted((left, right) =>
				left.statement.from.localeCompare(right.statement.from)
			)
			const newest = list.at(-1)!.statement
			const numberMasked = `••••${last4(number)}`
			let account = tdAccounts.find(
				(candidate) => last4(candidate.numberMasked) === last4(number)
			)
			const created = !account
			if (!account) {
				const name = accountName(list[0].file.name, newest)
				const type = guessAccountType(name)
				const id = randomUUID()
				const balance = newest.closingBalance
				tx.insert(bankAccount)
					.values({
						id,
						connectionId: targetConnection(),
						externalKey: `${name.toLowerCase()}|${numberMasked}`,
						name,
						type,
						numberMasked,
						currency: "CAD",
						balance: toCentsOrNull(balance),
						overdraftUsed:
							balance === null
								? null
								: toCents(Math.max(0, -balance)),
					})
					.run()
				account = { id, name, numberMasked, type, historyFrom: null }
				tdAccounts.push(account)
			}

			let added = 0
			let existing = 0
			let skipped = 0
			const occurrences = new Map<string, number>()
			for (const { statement } of list) {
				if (
					!isoDate.safeParse(statement.from).success ||
					!isoDate.safeParse(statement.to).success
				) {
					skipped += statement.transactions.length
					continue
				}
				for (const rawTransaction of statement.transactions) {
					const row = validateStatementRow(rawTransaction)
					if (!row.ok) {
						skipped++
						continue
					}
					const statementRow = row.row
					const base = `${statementRow.date}|${statementRow.description.toLowerCase()}|${statementRow.amount.toFixed(2)}|c`
					const occurrenceCount = occurrences.get(base) ?? 0
					occurrences.set(base, occurrenceCount + 1)
					// A sync has read every day from historyFrom on; its rows win there.
					if (
						account.historyFrom &&
						statementRow.date >= account.historyFrom
					) {
						existing++
						continue
					}
					const insertResult = tx
						.insert(bankTransaction)
						.values({
							id: randomUUID(),
							accountId: account.id,
							fingerprint: `${base}|${occurrenceCount}`,
							date: statementRow.date,
							description: statementRow.description,
							amount: toCents(statementRow.amount),
							runningBalance: toCentsOrNull(
								statementRow.runningBalance
							),
							pending: false,
						})
						.onConflictDoNothing({
							target: [
								bankTransaction.accountId,
								bankTransaction.fingerprint,
							],
						})
						.returning({ id: bankTransaction.id })
						.all()
					if (insertResult.length > 0) {
						added++
					} else {
						existing++
					}
				}
			}

			const gaps: AccountResult["gaps"] = []
			for (let i = 1; i < list.length; i++) {
				const prevEnd = list[i - 1].statement.to
				const start = list[i].statement.from
				if (start > prevEnd) {
					gaps.push({ from: dayAfter(prevEnd), to: start })
				}
			}
			if (account.historyFrom && newest.to < account.historyFrom) {
				gaps.push({
					from: dayAfter(newest.to),
					to: account.historyFrom,
				})
			}

			accounts.push({
				accountId: account.id,
				name: account.name,
				numberMasked: account.numberMasked ?? numberMasked,
				created,
				statements: list.length,
				added,
				existing,
				skipped,
				from: list[0].statement.from,
				to: newest.to,
				gaps,
			})
		}
	})
	return { files, accounts }
}
