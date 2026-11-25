import { sql } from "drizzle-orm"
import { check, text, type SQLiteColumn } from "drizzle-orm/sqlite-core"

/** `created_at`-style column: UTC `YYYY-MM-DD HH:MM:SS` text filled in by SQLite. */
export const timestampNow = (columnName: string) =>
	text(columnName)
		.notNull()
		.default(sql`(datetime('now'))`)

/** Options for {@link centsCheck}. */
interface CentsCheckOptions {
	/** The column may hold NULL (for example a balance the bank did not report). */
	nullable?: boolean
	/** Smallest value the app ever writes, as an invariant (a budget is never negative). */
	minimum?: number
}

/**
 * CHECK constraint for an INTEGER-cents column. INTEGER affinity alone would quietly keep a stray
 * 12.34 as a REAL, so this makes a writer that forgot `toCents` fail loudly.
 *
 * @param tableName Table that owns the column, used to name the constraint.
 * @param column The money column.
 * @param options Nullability and lower bound.
 */
export function centsCheck(
	tableName: string,
	column: SQLiteColumn,
	options: CentsCheckOptions = {}
) {
	const allowedTypes = options.nullable
		? sql`('integer', 'null')`
		: sql`('integer')`
	const lowerBound =
		options.minimum === undefined
			? sql``
			: sql` AND ${column} >= ${sql.raw(String(options.minimum))}`
	return check(
		`${tableName}_${column.name}_cents`,
		sql`typeof(${column}) IN ${allowedTypes}${lowerBound}`
	)
}
