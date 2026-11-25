/** Long month name (e.g. "March") for a `YYYY-MM` string, in the user's locale. */
export const monthName = (yearMonth: string) =>
	new Date(`${yearMonth}-15T12:00:00`).toLocaleString(undefined, {
		month: "long",
	})
