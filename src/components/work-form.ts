import { toast } from 'sonner'

/** Small helpers shared by the Work dialogs' forms. */
export const money = (s: string) => s.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
export const round2 = (n: number) => Math.round(n * 100) / 100
export const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
export const fail = (err: unknown) => toast.error((err as Error).message)
