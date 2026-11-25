import type { ConnectStep } from "@/lib/api"

export type Phase =
  | { type: "pick" }
  | { type: "td-method" }
  | { type: "form"; error?: string }
  | ConnectStep
