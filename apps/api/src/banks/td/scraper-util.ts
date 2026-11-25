/**
 * Shared constants and helpers for the TD EasyWeb scraper.
 */
import type { Locator } from "playwright"

/** TD EasyWeb sign-in entry URL. */
export const LOGIN_URL = "https://easyweb.td.com/"
/** Safety cap on accounts scraped in one TD session. */
export const MAX_ACCOUNTS = 20

/** Playwright selector for TD EasyWeb username field. */
export const USERNAME_SEL =
	'#username, input[name="username"], input[autocomplete="username"]'
/** Playwright selector for TD EasyWeb password field. */
export const PASSWORD_SEL = '#uapPassword, input[type="password"]'
/** Page text that indicates TD 2-step verification. */
export const MFA_TEXT =
	/2-step|two-step|verif|security code|one-time|confirm (it.s|that it.s) you|make sure it.s you|let.s make sure/i
/** Playwright selector for TD one-time code field. */
export const CODE_SEL =
	'input#code, input[autocomplete="one-time-code"], input[name*="code" i]:not([type="hidden"]), input[id*="otp" i], input[name*="otp" i], input[id*="securityCode" i]'

/** In-page extractor. Written as a plain string so the TS toolchain can't inject helpers into it. */
export const EXTRACT_SCRIPT = `(() => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const headingNear = (t) => {
    let el = t;
    for (let depth = 0; depth < 6 && el; depth++) {
      let p = el.previousElementSibling;
      while (p) {
        const h = p.matches('h1,h2,h3,h4,h5,[role=heading],caption') ? p : p.querySelector('h1,h2,h3,h4,h5,[role=heading]');
        if (h && clean(h.innerText)) return clean(h.innerText);
        p = p.previousElementSibling;
      }
      el = el.parentElement;
    }
    return '';
  };
  const tables = [...document.querySelectorAll('table')].map((t, index) => {
    let headers = [...t.querySelectorAll('thead th, thead td')].map((c) => clean(c.innerText));
    let rows = [...t.querySelectorAll('tbody tr')];
    if (!rows.length) rows = [...t.querySelectorAll('tr')];
    if (!headers.length) {
      const first = t.querySelector('tr');
      if (first && first.querySelector('th')) {
        headers = [...first.querySelectorAll('th,td')].map((c) => clean(c.innerText));
        rows = rows.filter((r) => r !== first);
      }
    }
    const caption = t.querySelector('caption');
    return {
      index,
      headers,
      context: clean(caption && caption.innerText) || headingNear(t),
      rows: rows
        .map((r) => ({
          cells: [...r.querySelectorAll('td,th')].map((c) => clean(c.innerText)),
          link: clean(r.querySelector('a') && r.querySelector('a').innerText) || null,
        }))
        .filter((r) => r.cells.some(Boolean)),
    };
  });
  const ariaTables = [...document.querySelectorAll('mat-table, [role=table], [role=grid]')]
    .filter((e) => e.tagName !== 'TABLE')
    .map((t, i) => ({
      index: 1000 + i,
      headers: [...t.querySelectorAll('mat-header-cell, [role=columnheader]')].map((c) => clean(c.innerText)),
      context: headingNear(t),
      rows: [...t.querySelectorAll('mat-row, [role=row]')]
        .map((r) => ({
          cells: [...r.querySelectorAll('mat-cell, [role=cell], [role=gridcell]')].map((c) => clean(c.innerText)),
          link: clean(r.querySelector('a') && r.querySelector('a').innerText) || null,
        }))
        .filter((r) => r.cells.length),
    }));
  return {
    url: location.href,
    title: document.title,
    text: document.body ? document.body.innerText.slice(0, 60000) : '',
    tables: tables.concat(ariaTables),
  };
})()`

/** Pause the scraper between Playwright actions. */
export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms))

/** True when the locator is visible without throwing on detached nodes. */
export async function visible(locator: Locator): Promise<boolean> {
	return locator
		.first()
		.isVisible()
		.catch(() => false)
}

/** ISO calendar date for `days` before today (UTC fields). */
export function isoDaysAgo(days: number) {
	const date = new Date()
	date.setDate(date.getDate() - days)
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/** EasyWeb's date inputs take MM/DD/YYYY. */
export function toTdInputDate(iso: string) {
	return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`
}
