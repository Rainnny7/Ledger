export type PaginationRangeItem =
	| { kind: "page"; page: number }
	| { kind: "ellipsis"; key: string }

/**
 * Numbered page strip for pagination: always first and last, current page ± `siblingCount`,
 * with ellipsis entries where there are gaps.
 */
export function paginationRange(
	current: number,
	totalPages: number,
	siblingCount = 2
): PaginationRangeItem[] {
	if (totalPages <= 1) {
		return []
	}

	const pages = new Set<number>()
	pages.add(1)
	pages.add(totalPages)
	for (
		let index = current - siblingCount;
		index <= current + siblingCount;
		index++
	) {
		if (index >= 1 && index <= totalPages) {
			pages.add(index)
		}
	}

	const sorted = [...pages].toSorted((left, right) => left - right)
	const items: PaginationRangeItem[] = []

	for (let index = 0; index < sorted.length; index++) {
		const page = sorted[index]!
		const previous = sorted[index - 1]
		if (index > 0 && previous !== undefined && page - previous > 1) {
			items.push({
				kind: "ellipsis",
				key: `ellipsis-${previous}-${page}`,
			})
		}
		items.push({ kind: "page", page })
	}

	return items
}
