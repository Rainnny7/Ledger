import {
	type Browser,
	type BrowserContext,
	chromium,
	type Frame,
	type Locator,
	type Page,
} from "playwright"
import { roundMoney, sumMoney } from "../../../shared/money.ts"
import { chromiumLaunchEnv, chromiumUseSandbox } from "../browser-env.ts"
import { env } from "../../config/env.ts"
import { redactBankErrorMessage } from "../errors.ts"
import type {
	BankClient,
	LoginStep,
	MfaOption,
	ScrapedAccount,
} from "../types.ts"
import {
	findLabelledAmount,
	parseAccountDetails,
	parseAccountSummary,
	parseTransactions,
	type RawFrame,
} from "./parse.ts"
import {
	CODE_SEL,
	EXTRACT_SCRIPT,
	LOGIN_URL,
	MAX_ACCOUNTS,
	MFA_TEXT,
	PASSWORD_SEL,
	USERNAME_SEL,
	isoDaysAgo,
	sleep,
	toTdInputDate,
	visible,
} from "./scraper-util.ts"

const dateDigits = (rawValue: string) => rawValue.replace(/\D/g, "")

async function fillTdField(field: Locator, value: string) {
	for (let attempt = 0; attempt < 3; attempt++) {
		await field.click()
		await field.fill(value)
		await field.blur()
		await sleep(300)
		if ((await field.inputValue()).trim() === value.trim()) {
			return true
		}
	}
	return false
}

/** TdScraper bank client implementation. */
export class TdScraper implements BankClient {
	private browser?: Browser
	private context?: BrowserContext
	private page?: Page
	private mfaChoices: Locator[] = []

	async open(storageState?: unknown) {
		this.browser = await chromium.launch({
			headless: env.tdHeadless,
			channel: process.env.TD_BROWSER_CHANNEL || undefined, // e.g. "chrome" to use installed Chrome
			args: ["--disable-blink-features=AutomationControlled"],
			env: chromiumLaunchEnv(),
			chromiumSandbox: chromiumUseSandbox(),
		})
		const ua = (
			await this.browser.newPage().then(async (newPage) => {
				const userAgentValue = await newPage.evaluate(
					"navigator.userAgent"
				)
				await newPage.close()
				return String(userAgentValue)
			})
		).replace("HeadlessChrome", "Chrome")
		this.context = await this.browser.newContext({
			userAgent: ua,
			locale: "en-CA",
			timezoneId: "America/Toronto",
			viewport: { width: 1366, height: 900 },
			// biome-ignore lint: Playwright's storage state type
			storageState: (storageState as any) ?? undefined,
		})
		this.page = await this.context.newPage()
		this.page.setDefaultTimeout(20_000)
	}

	async close() {
		await this.browser?.close().catch(() => {})
		this.browser = undefined
	}

	async storageState(): Promise<unknown> {
		return this.context?.storageState()
	}

	private get p(): Page {
		if (!this.page) {
			throw new Error("Browser not open")
		}
		return this.page
	}

	// ---------------------------------------------------------------- login

	async login(username: string, password: string): Promise<LoginStep> {
		const page = this.p
		await page.goto(LOGIN_URL, {
			waitUntil: "domcontentloaded",
			timeout: 45_000,
		})

		// A remembered session may skip the login form entirely.
		const first = await Promise.race([
			page
				.locator(USERNAME_SEL)
				.first()
				.waitFor({ state: "visible", timeout: 30_000 })
				.then(() => "form" as const),
			this.waitForLoggedIn(30_000).then((ok) =>
				ok ? ("in" as const) : new Promise<never>(() => {})
			),
		]).catch(() => "timeout" as const)

		if (first === "in") {
			return { type: "success" }
		}
		if (first === "timeout") {
			return {
				type: "error",
				message:
					"Could not find the EasyWeb login form. TD may have changed their page.",
			}
		}

		// Close the cookie banner (without opting into tracking) so it can't cover the Login button.
		const closeBanner = page
			.locator(
				".onetrust-close-btn-handler, #onetrust-reject-all-handler"
			)
			.first()
		if (await visible(closeBanner)) {
			await closeBanner.click().catch(() => {})
		}

		// Use fill() rather than per-key typing: TD's username field reformats as you
		// type and drops keystrokes (an Access Card number came through as 6 of 16 digits).
		const user = page.locator(USERNAME_SEL).first()
		const pass = page.locator(PASSWORD_SEL).first()
		const cleanUsername = username.replace(/\s+/g, "")
		if (
			!(await fillTdField(user, cleanUsername)) ||
			!(await fillTdField(pass, password))
		) {
			return {
				type: "error",
				message:
					"Could not enter your username/password into the EasyWeb form. Nothing was submitted.",
			}
		}

		const submit = page.locator(".login-form button.td-button-secondary")
		const fallback = page.locator(
			'.login-form button[type="submit"], button:text-is("Login")'
		)
		if (await visible(submit)) {
			await submit.first().click()
		} else if (await visible(fallback)) {
			await fallback.first().click()
		} else {
			await pass.press("Enter")
		}

		return this.waitForStep(60_000)
	}

	async chooseMfa(optionId: string): Promise<LoginStep> {
		const choice = this.mfaChoices[Number(optionId)]
		if (!choice) {
			return {
				type: "error",
				message: "That verification option is no longer available.",
			}
		}
		await choice.click()
		await sleep(500)

		// Radio-style choices need a separate "Send" / "Continue" click.
		const cont = this.p.locator('button, [role="button"]').filter({
			hasText:
				/^\s*(send( code)?|continue|next|get code|send security code)\s*$/i,
		})
		if (
			!(await visible(this.p.locator(CODE_SEL))) &&
			(await visible(cont))
		) {
			await cont
				.first()
				.click()
				.catch(() => {})
		}
		return this.waitForStep(45_000, { ignoreSelect: true })
	}

	async submitCode(code: string): Promise<LoginStep> {
		const page = this.p
		const input = page.locator(CODE_SEL).first()
		if (!(await visible(input))) {
			return this.waitForStep(10_000)
		}
		await input.fill(code.replace(/\s+/g, ""))

		// Ask TD to remember this browser so future syncs need fewer codes.
		const remember = page
			.getByLabel(/remember|trust this|don.t ask/i)
			.first()
		if (await visible(remember)) {
			await remember.check().catch(() => {})
		}

		const submitButton = page
			.locator('button, [role="button"], input[type="submit"]')
			.filter({
				hasText: /^\s*(enter|submit|verify|continue|confirm|next)\s*$/i,
			})
		if (await visible(submitButton)) {
			await submitButton.first().click()
		} else {
			await input.press("Enter")
		}

		await sleep(1500)
		return this.waitForStep(45_000, { codeSubmitted: true })
	}

	/** Called while the user approves a push notification in the TD app. */
	async waitForApproval(): Promise<LoginStep> {
		return this.waitForStep(25_000, { allowPush: true })
	}

	private async waitForLoggedIn(timeout: number): Promise<boolean> {
		const end = Date.now() + timeout
		while (Date.now() < end) {
			if (this.isLoggedInUrl(this.p.url())) {
				return true
			}
			await sleep(500)
		}
		return false
	}

	private isLoggedInUrl(url: string) {
		return (
			url.startsWith("https://easyweb.td.com/") &&
			!/authentication|uap-ui|login/i.test(url)
		)
	}

	private async waitForStep(
		timeout: number,
		opts: {
			ignoreSelect?: boolean
			codeSubmitted?: boolean
			allowPush?: boolean
		} = {}
	): Promise<LoginStep> {
		const end = Date.now() + timeout
		let lastStep: LoginStep | null = null
		while (Date.now() < end) {
			const step = await this.detect(opts).catch(() => null)
			if (step) {
				if (step.type === "mfa_push" && opts.allowPush) {
					lastStep = step
				} else {
					return step
				}
			}
			await sleep(1000)
		}
		if (lastStep) {
			return lastStep
		}
		return {
			type: "error",
			message: "Timed out waiting for EasyWeb to respond.",
		}
	}

	private async detect(opts: {
		ignoreSelect?: boolean
		codeSubmitted?: boolean
	}): Promise<LoginStep | null> {
		const page = this.p
		if (this.isLoggedInUrl(page.url())) {
			await page.waitForLoadState("domcontentloaded").catch(() => {})
			return { type: "success" }
		}

		let text = await page
			.locator("body")
			.innerText({ timeout: 3000 })
			.catch(() => "")
		const alertText = (
			await page
				.locator(
					'[role="alert"], .td-error, .error-message, .td-form-error, .td-error-message, [class*="error" i]'
				)
				.allInnerTexts()
				.catch(() => [] as string[])
		)
			.map((candidateText) => candidateText.trim())
			.filter(Boolean)
			.join(" ")

		const errorRe =
			/incorrect|doesn.t match|do not match|not recogni[sz]ed|invalid|locked|suspended|unable to (log|sign)|try again|expired/i

		// TD shows 2-Step Verification as a modal on top of the login form, so look at
		// the modal's own text first. (The form's sidebar also mentions "Two-Step
		// Verification" and the "TD app", so the page text alone is misleading.)
		const modalTexts = await page
			.locator(
				'[role="dialog"]:visible, .modal:visible, mat-dialog-container:visible, .cdk-overlay-pane:visible, [class*="modal" i]:visible'
			)
			.allInnerTexts()
			.catch(() => [] as string[])
		const modalText =
			modalTexts.find((candidateText) => MFA_TEXT.test(candidateText)) ??
			""
		const mfaButtons = page
			.locator('button:visible, [role="button"]:visible')
			.filter({ hasText: /^\s*(text|call) me\s*$/i })
		const hasMfaUi =
			!!modalText ||
			(await visible(page.locator(CODE_SEL))) ||
			(await mfaButtons.count().catch(() => 0)) > 0

		if (!hasMfaUi && (await visible(page.locator(PASSWORD_SEL)))) {
			if (errorRe.test(alertText)) {
				return { type: "error", message: alertText.slice(0, 300) }
			}
			return null // still on the login form (submitting / redirecting)
		}
		if (modalText) {
			text = modalText
		}

		if (await visible(page.locator(CODE_SEL))) {
			if (opts.codeSubmitted && errorRe.test(alertText)) {
				return {
					type: "error",
					message:
						alertText.slice(0, 300) ||
						"The security code was not accepted.",
				}
			}
			if (opts.codeSubmitted) {
				return null
			} // still processing
			return {
				type: "mfa_code",
				prompt:
					this.promptFrom(text) ||
					"Enter the security code TD sent you.",
			}
		}

		if (!hasMfaUi && !MFA_TEXT.test(text)) {
			return null
		}

		if (!opts.ignoreSelect) {
			const options = await this.collectMfaOptions()
			if (options.length) {
				return {
					type: "mfa_select",
					prompt: this.promptFrom(text),
					options,
				}
			}
		}

		if (
			/approve (the|this|it)|approve .*(td app|notification)|check your (td app|phone for a notification)/i.test(
				text
			)
		) {
			return {
				type: "mfa_push",
				prompt:
					this.promptFrom(text) ||
					"Approve the sign-in from the TD app on your phone.",
			}
		}
		return null
	}

	private promptFrom(text: string): string {
		const line = text
			.split("\n")
			.map((textLine) => textLine.trim())
			.find(
				(textLine) =>
					/verif|code|confirm|approve|sent|text|call/i.test(
						textLine
					) &&
					textLine.length > 15 &&
					textLine.length < 220
			)
		return line ?? ""
	}

	private async collectMfaOptions(): Promise<MfaOption[]> {
		// TD's modal: a phone list where each number has its own "Call me" / "Text me" buttons.
		const perPhone = this.p
			.locator('button:visible, [role="button"]:visible')
			.filter({ hasText: /^\s*(text|call) me\s*$/i })
		const phoneButtonCount = await perPhone.count().catch(() => 0)
		if (phoneButtonCount > 0) {
			const items: { label: string; element: Locator; text: boolean }[] =
				[]
			for (let i = 0; i < phoneButtonCount; i++) {
				const element = perPhone.nth(i)
				const action = (await element.innerText().catch(() => ""))
					.replace(/\s+/g, " ")
					.trim()
				// Walk up to the nearest container that shows exactly one phone number.
				const phone: string = await element
					.evaluate((node: any) => {
						const phoneRe =
							/\+?\d?\s*\(?[•*x]{3}\)?\s*[•*x]{3}\s*-?\s*\d{4}/gi
						const isPhone = /[•*x]{3}\s*-?\s*\d{4}/i
						for (
							let ancestor = node.parentElement;
							ancestor && ancestor !== node.ownerDocument.body;
							ancestor = ancestor.parentElement
						) {
							const containerText: string =
								ancestor.innerText || ""
							const phoneMatches = containerText.match(phoneRe)
							if (phoneMatches && phoneMatches.length > 1) {
								break
							}
							if (phoneMatches && phoneMatches.length === 1) {
								const name = containerText
									.split("\n")
									.map((candidateLine: string) =>
										candidateLine.trim()
									)
									.find(
										(candidateLine: string) =>
											candidateLine &&
											candidateLine.length < 40 &&
											!isPhone.test(candidateLine) &&
											!/(text|call) me/i.test(
												candidateLine
											)
									)
								return name
									? `${phoneMatches[0]} (${name})`
									: phoneMatches[0]
							}
						}
						return ""
					})
					.catch(() => "")
				const label = `${action}${phone ? ` at ${phone.replace(/\s+/g, " ")}` : ` (option ${i + 1})`}`
				items.push({ label, element, text: /^text/i.test(action) })
			}
			items.sort((left, right) => Number(right.text) - Number(left.text)) // texting first
			this.mfaChoices = items.map((item) => item.element)
			return items.map((it, i) => ({ id: String(i), label: it.label }))
		}

		const candidates = this.p.locator(
			'button, [role="button"], [role="radio"], [role="option"], mat-radio-button, label, a, li, [class*="radio" i]'
		)
		const count = Math.min(await candidates.count(), 150)
		const found: { label: string; element: Locator }[] = []
		const seen = new Set<string>()
		for (let i = 0; i < count; i++) {
			const element = candidates.nth(i)
			if (!(await element.isVisible().catch(() => false))) {
				continue
			}
			const label = (await element.innerText().catch(() => ""))
				.replace(/\s+/g, " ")
				.trim()
			if (!label || label.length > 120 || seen.has(label)) {
				continue
			}
			const hasPhone =
				/[*•x]{2,}[\s)-]*\d{2,4}\b|ending in \d{2,4}/i.test(label)
			if (
				!hasPhone &&
				/cancel|back|help|faq|privacy|security|legal|log ?out|french|français|contact/i.test(
					label
				)
			) {
				continue
			}
			const isMethod =
				hasPhone ||
				/^(text|call|email) me\b|text message|\bsms\b|phone call|voice call|email me/i.test(
					label
				)
			if (!isMethod) {
				continue
			}
			// Skip wrappers that contain several options (e.g. the whole list).
			if ((label.match(/[*•x]{2,}[\s)-]*\d{2,4}\b/gi)?.length ?? 0) > 1) {
				continue
			}
			seen.add(label)
			found.push({ label, element })
		}
		// A <li> and the <label> inside it describe the same option; keep the most specific.
		const kept = found.filter(
			(candidate) =>
				!found.some(
					(other) =>
						other !== candidate &&
						other.label.length < candidate.label.length &&
						candidate.label.includes(other.label)
				)
		)
		this.mfaChoices = kept.map((choice) => choice.element)
		return kept.map((choice, i) => ({ id: String(i), label: choice.label }))
	}

	// ---------------------------------------------------------------- scraping

	private async extractAll(): Promise<RawFrame[]> {
		const frames: Frame[] = this.p.frames()
		const out: RawFrame[] = []
		for (const frame of frames) {
			try {
				out.push((await frame.evaluate(EXTRACT_SCRIPT)) as RawFrame)
			} catch {
				out.push({ url: frame.url(), title: "", text: "", tables: [] })
			}
		}
		return out
	}

	private async goHome() {
		const page = this.p
		const nav = page
			.locator(
				'[data-analytics-click="Accounts"], [analytics-click="Accounts"], a:has-text("My Accounts")'
			)
			.first()
		if (await visible(nav)) {
			await nav.click().catch(() => {})
		} else {
			await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" })
		}
		await this.settle()
	}

	/** Wait for the SPA/frames to finish rendering something table-like. */
	private async settle(timeout = 25_000) {
		const page = this.p
		await page.waitForLoadState("domcontentloaded").catch(() => {})
		const end = Date.now() + timeout
		while (Date.now() < end) {
			for (const frame of page.frames()) {
				const rowCount = await frame
					.locator('table tr, mat-row, [role="row"]')
					.count()
					.catch(() => 0)
				if (rowCount > 1) {
					await sleep(1500)
					return
				}
			}
			await sleep(750)
		}
	}

	/**
	 * @param sinceFor  per account, the earliest date worth reading (incremental sync), or null for
	 *                  a full backfill (EasyWeb allows up to 18 months).
	 */
	async scrapeAccounts(
		onProgress?: (message: string) => void,
		sinceFor: (externalKey: string) => string | null = () => null
	): Promise<ScrapedAccount[]> {
		const page = this.p
		onProgress?.("Loading account summary…")
		await this.settle()

		let summary = parseAccountSummary(await this.extractAll())
		if (summary.length === 0) {
			await this.goHome()
			summary = parseAccountSummary(await this.extractAll())
		}
		if (summary.length === 0) {
			throw new Error(
				"Logged in, but could not find any accounts on the EasyWeb summary page."
			)
		}

		const results: ScrapedAccount[] = []
		for (const acct of summary.slice(0, MAX_ACCOUNTS)) {
			onProgress?.(`Reading ${acct.name}…`)
			const base: ScrapedAccount = {
				externalKey: acct.externalKey,
				name: acct.name,
				type: acct.type,
				numberMasked: acct.numberMasked,
				currency: /usd|u\.s\./i.test(acct.name) ? "USD" : "CAD",
				balance: acct.balance,
				available: acct.available,
				overdraftLimit: null,
				overdraftUsed: null,
				creditLimit: null,
				transactions: [],
				historyFrom: null,
				details: null,
			}

			try {
				const frame = page.frames()[acct.frameIndex] ?? page.mainFrame()
				const link = frame
					.locator("a", { hasText: acct.linkText })
					.nth(acct.linkOccurrence)
				if (!(await visible(link))) {
					await this.goHome()
				}
				const target = (
					page.frames()[acct.frameIndex] ?? page.mainFrame()
				)
					.locator("a", { hasText: acct.linkText })
					.nth(acct.linkOccurrence)
				await target.click({ timeout: 15_000 })
				await this.settle()

				if (acct.type === "chequing" || acct.type === "savings") {
					const since = sinceFor(acct.externalKey)
					onProgress?.(
						since
							? `Reading new ${acct.name} transactions (since ${since})…`
							: `Reading ${acct.name} full history (up to 18 months)…`
					)
					base.historyFrom = await this.expandDateRange(since)
				}
				await this.loadAllRows()

				const frames = await this.extractAll()
				const text = frames.map((rawFrame) => rawFrame.text).join("\n")

				base.transactions = parseTransactions(frames, acct.type)
				base.overdraftLimit = findLabelledAmount(
					text,
					/overdraft (protection )?(limit|amount|available)|overdraft protection/i
				)
				base.creditLimit = findLabelledAmount(text, /credit limit/i)
				base.available ??= findLabelledAmount(
					text,
					/available (balance|credit|funds)?/i
				)
				base.balance ??= findLabelledAmount(
					text,
					/(current |account )?balance/i
				)
				base.details = await this.readManageTab(text)
			} catch (error) {
				console.warn(
					`[td] failed reading ${acct.name}:`,
					redactBankErrorMessage((error as Error).message)
				)
			}

			// Derive overdraft numbers for bank accounts.
			if (base.type === "chequing" || base.type === "savings") {
				if (base.balance !== null) {
					base.overdraftUsed = base.balance < 0 ? -base.balance : 0
				}
				if (
					base.overdraftLimit === null &&
					base.available !== null &&
					base.balance !== null &&
					base.available > base.balance
				) {
					const implied = roundMoney(
						base.available - Math.max(base.balance, 0)
					)
					if (implied > 0) {
						base.overdraftLimit = sumMoney([
							implied,
							base.overdraftUsed ?? 0,
						])
					}
				}
			}
			results.push(base)
			await this.goHome().catch(() => {})
		}
		return results
	}

	/**
	 * Direct deposit numbers and limits live on the account's "Manage" tab. Best effort: if the tab
	 * isn't there (credit cards, older layouts) we keep whatever the Activity page showed.
	 */
	private async readManageTab(activityText: string) {
		let text = activityText
		try {
			let tab: Locator | null = null
			for (const frame of this.p.frames()) {
				const cand = frame
					.locator('label, [role="tab"], button', {
						hasText: /^\s*Manage\s*$/,
					})
					.first()
				if (await visible(cand)) {
					tab = cand
					break
				}
			}
			if (tab) {
				await tab.click({ timeout: 10_000 })
				await this.settle()
				text +=
					"\n" +
					(await this.extractAll())
						.map((rawFrame) => rawFrame.text)
						.join("\n")
			}
		} catch (error) {
			console.warn(
				"[td] could not open the Manage tab:",
				redactBankErrorMessage((error as Error).message)
			)
		}
		const details = parseAccountDetails(text)
		return details.accountNumber || details.transit || details.limits.length
			? details
			: null
	}

	/**
	 * EasyWeb shows the last 30 days by default. Open the activity filter panel, choose "By date range"
	 * and set the From date. Tries 18 → 12 → 6 months (TD rejects dates it won't serve), then falls back
	 * to the "Last 120 days" preset. Returns the ISO from-date applied, or null if only the default window loaded.
	 */
	private async expandDateRange(
		since: string | null
	): Promise<string | null> {
		const page = this.p
		await this.dismissCookieBanner()
		const candidates = since
			? [since]
			: [isoDaysAgo(18 * 30 + 3), isoDaysAgo(365), isoDaysAgo(183)]
		try {
			const icon = page
				.locator(
					'#daActivityFilerIcon, [id*="ActivityFil" i][id*="Icon" i]'
				)
				.first()
			if (await visible(icon)) {
				const form = page.locator("#daTransFiltersForm").first()
				if (!(await visible(form))) {
					await icon.click()
				}
				await form.waitFor({ state: "visible", timeout: 8_000 })
				const byDate = page
					.locator('label[for="daByDateRadioButton-input"]')
					.first()
				if (await visible(byDate)) {
					await byDate.click()
				} else {
					await page
						.locator("#daByDateRadioButton-input")
						.first()
						.check({ force: true })
				}
				const fromInput = page.locator("#input-daDtTransFrom").first()
				await fromInput.waitFor({ state: "visible", timeout: 5_000 })

				for (const from of candidates) {
					const ok = await this.setDateInput(
						fromInput,
						toTdInputDate(from)
					)
					const toInput = page.locator("#input-daDtTransTo").first()
					if (
						(await visible(toInput)) &&
						!(await toInput.inputValue().catch(() => ""))
					) {
						await this.setDateInput(
							toInput,
							toTdInputDate(isoDaysAgo(0))
						)
					}
					await sleep(400)
					const invalid = await visible(
						form
							.getByText(
								/please use|invalid|cannot be|must be|not available/i
							)
							.first()
					)
					const apply = page
						.locator("button", {
							hasText: /^\s*apply filters?\s*$/i,
						})
						.first()
					if (
						ok &&
						!invalid &&
						(await visible(apply)) &&
						(await apply.isEnabled())
					) {
						await apply.click()
						await this.settle()
						return from
					}
				}
				const close = page
					.locator("button", { hasText: /^\s*close filters?\s*$/i })
					.first()
				if (await visible(close)) {
					await close.click().catch(() => {})
				}
			}
		} catch {
			/* fall through to the dropdown */
		}

		// Fallback: the "Last 30 days" dropdown also offers 60 / 90 / 120 days.
		try {
			const select = page
				.locator('mat-select, [role="combobox"]', {
					hasText: /last \d+ days/i,
				})
				.first()
			if (await visible(select)) {
				await select.click()
				const option = page
					.locator('mat-option, [role="option"]')
					.filter({ hasText: /120/ })
					.first()
				await option.click({ timeout: 5_000 })
				await this.settle()
				return isoDaysAgo(120)
			}
		} catch {
			/* best effort */
		}
		return null
	}

	/**
	 * TD's date fields are masked inputs: fill() appends to the existing date instead of replacing it
	 * ("10/26/202605/30/2025"). Select everything, delete, then type it. Returns whether it stuck.
	 */
	private async setDateInput(input: Locator, value: string) {
		for (let attempt = 0; attempt < 3; attempt++) {
			await input.click()
			await input.press("ControlOrMeta+a")
			await input.press("Backspace")
			if (attempt === 2) {
				await input.fill("")
			}
			await input.pressSequentially(value, { delay: 40 })
			const typed = await input.inputValue().catch(() => "")
			await input.press("Tab")
			if (dateDigits(typed) === dateDigits(value)) {
				return true
			}
		}
		return false
	}

	private async dismissCookieBanner() {
		const cookieButton = this.p
			.locator(
				".onetrust-close-btn-handler, #onetrust-reject-all-handler"
			)
			.first()
		if (await visible(cookieButton)) {
			await cookieButton.click().catch(() => {})
		}
	}

	/** The posted-transactions table loads more rows as you scroll; keep scrolling until it stops growing. */
	private async loadAllRows(maxRows = 5_000) {
		const page = this.p
		const rows = page.locator("#daActivityPostedTable tbody tr")
		if ((await rows.count().catch(() => 0)) === 0) {
			return
		}
		const loading = page.locator("#daActivityPostedTable ~ *", {
			hasText: /^\s*loading/i,
		})
		let last = -1
		let stable = 0
		for (let i = 0; i < 400 && stable < 4; i++) {
			const rowCount = await rows.count().catch(() => 0)
			if (rowCount >= maxRows) {
				break
			}
			if (rowCount > last) {
				last = rowCount
				stable = 0
			} else if (!(await visible(loading.first()))) {
				stable++
			}
			await rows
				.nth(Math.max(0, rowCount - 1))
				.scrollIntoViewIfNeeded({ timeout: 3_000 })
				.catch(() => {})
			await page.mouse.wheel(0, 3_000).catch(() => {})
			await sleep(700)
		}
	}
}
