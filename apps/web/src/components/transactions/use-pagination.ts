import { URL_OPTIONS } from "@/lib/url-state"
import { parseAsInteger, useQueryStates } from "nuqs"
import { useCallback, useMemo } from "react"

/** Allowed row counts for transaction tables (also in the URL as `perPage`). */
export const TRANSACTIONS_PER_PAGE_OPTIONS = [25, 50, 75, 100, 200] as const

/** Default rows per page when `perPage` is missing or invalid in the URL. */
export const DEFAULT_TRANSACTIONS_PER_PAGE = 75

function normalizePerPage(value: number) {
	return (TRANSACTIONS_PER_PAGE_OPTIONS as readonly number[]).includes(value)
		? value
		: DEFAULT_TRANSACTIONS_PER_PAGE
}

/**
 * `page` and `perPage` query params shared by the transactions list and account history tables.
 * Page is clamped to the current result count; changing `perPage` jumps back to page 1.
 */
export function usePagination(totalCount: number) {
	const [{ page: urlPage, perPage: urlPerPage }, setStates] = useQueryStates(
		{
			page: parseAsInteger.withDefault(1),
			perPage: parseAsInteger.withDefault(DEFAULT_TRANSACTIONS_PER_PAGE),
		},
		URL_OPTIONS
	)

	const perPage = useMemo(() => normalizePerPage(urlPerPage), [urlPerPage])
	const totalPages = Math.max(1, Math.ceil(totalCount / perPage) || 1)
	const page = useMemo(() => {
		const value = urlPage < 1 ? 1 : urlPage
		return Math.min(value, totalPages)
	}, [urlPage, totalPages])

	const setPage = useCallback(
		(next: number) => {
			const clamped = Math.max(1, Math.min(next, totalPages))
			void setStates({ page: clamped <= 1 ? null : clamped })
		},
		[setStates, totalPages]
	)

	const setPerPage = useCallback(
		(next: number) => {
			const normalized = normalizePerPage(next)
			void setStates({
				perPage:
					normalized === DEFAULT_TRANSACTIONS_PER_PAGE
						? null
						: normalized,
				page: null,
			})
		},
		[setStates]
	)

	const resetPage = useCallback(() => {
		void setStates({ page: null })
	}, [setStates])

	return {
		page,
		perPage,
		totalPages,
		setPage,
		setPerPage,
		resetPage,
	}
}