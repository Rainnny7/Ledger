export const monthName = (ym: string) =>
  new Date(`${ym}-15T12:00:00`).toLocaleString(undefined, { month: "long" })
