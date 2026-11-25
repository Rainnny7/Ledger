import { toast } from "sonner"
import { copyText } from "@/lib/work"

export const fail = (err: unknown) => toast.error((err as Error).message)

export async function copy(text: string, what: string) {
  if (await copyText(text)) toast.success(`${what} copied`)
  else toast.error("Couldn’t copy to the clipboard")
}
