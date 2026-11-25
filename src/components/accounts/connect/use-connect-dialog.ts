import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  isProviderId,
  PROVIDERS,
  type ProviderId,
} from "@/components/accounts/providers"
import { api, notifyDataChanged, type SessionView } from "@/lib/api"
import type { Phase } from "./connect-types"

interface Connection {
  id: string
  institution: string
  savedCredentials: boolean
  usernameMasked: string
}

export function useConnectDialog({
  open,
  onOpenChange,
  connection,
  full,
  onConnected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  connection?: Connection | null
  full: boolean
  onConnected?: (connectionId: string) => void
}) {
  const [provider, setProvider] = useState<ProviderId>("td")
  const [phase, setPhase] = useState<Phase>({ type: "pick" })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [mfaChoice, setMfaChoice] = useState<string>("")
  const [code, setCode] = useState("")

  const onConnectedRef = useRef(onConnected)
  useLayoutEffect(() => {
    onConnectedRef.current = onConnected
  })

  const resetKey = open ? `${connection?.id ?? ""}:${full}` : null
  const [lastResetKey, setLastResetKey] = useState<string | null>(null)
  const autoStart = !!connection?.savedCredentials
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    if (resetKey !== null) {
      const p =
        connection && isProviderId(connection.institution)
          ? connection.institution
          : "td"
      setProvider(p)
      setPhase(
        autoStart
          ? { type: "syncing", message: `Connecting to ${PROVIDERS[p].label}…` }
          : connection
            ? { type: "form" }
            : { type: "pick" }
      )
      setSessionId(null)
      setBusy(autoStart)
      setPassword("")
      setCode("")
      setMfaChoice("")
      setUsername("")
      setRemember(autoStart)
    }
  }

  const callGen = useRef(0)

  const meta = PROVIDERS[provider]

  function apply(view: SessionView) {
    setSessionId(view.sessionId)
    if (view.step.type === "error") {
      setPhase({ type: "form", error: view.step.message })
      setSessionId(null)
      return
    }
    if (view.step.type === "mfa_select")
      setMfaChoice(view.step.options[0]?.id ?? "")
    if (view.step.type === "done") {
      toast.success(`${meta.label} synced`)
      notifyDataChanged()
      onConnectedRef.current?.(view.step.connectionId)
      onOpenChange(false)
    }
    setPhase(view.step)
  }

  /** `isStale` lets an effect disown a request it has since been superseded by. */
  async function call(fn: () => Promise<SessionView>, isStale?: () => boolean) {
    const gen = ++callGen.current
    setBusy(true)
    try {
      const view = await fn()
      if (isStale?.() || gen !== callGen.current) {
        if (view.step.type !== "done" && view.step.type !== "error")
          void api.cancelSession(view.sessionId).catch(() => {})
        return
      }
      apply(view)
    } catch (e) {
      if (isStale?.() || gen !== callGen.current) return
      setPhase({ type: "form", error: (e as Error).message })
      setSessionId(null)
    } finally {
      setBusy(false)
    }
  }

  // Saved credentials re-sync straight away. A re-run (reopen, strict mode) makes the earlier
  // response stale, so it's dropped instead of overwriting the newer session.
  useEffect(() => {
    if (!open || !connection?.savedCredentials) return
    let cancelled = false
    const gen = ++callGen.current
    const p = isProviderId(connection.institution)
      ? connection.institution
      : "td"
    setBusy(true)
    void (async () => {
      try {
        const view = await api.connect(p, { connectionId: connection.id, full })
        if (cancelled || gen !== callGen.current) {
          if (view.step.type !== "done" && view.step.type !== "error")
            void api.cancelSession(view.sessionId).catch(() => {})
          return
        }
        apply(view)
      } catch (e) {
        if (cancelled || gen !== callGen.current) return
        setPhase({ type: "form", error: (e as Error).message })
        setSessionId(null)
      } finally {
        setBusy(false)
      }
    })()
    return () => {
      cancelled = true
      callGen.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connection?.id, full])

  function start(p: ProviderId, body: Parameters<typeof api.connect>[1]) {
    setPhase({
      type: "syncing",
      message: `Connecting to ${PROVIDERS[p].label}…`,
    })
    return call(() => api.connect(p, body))
  }

  const polling =
    phase.type === "syncing" ||
    phase.type === "success" ||
    phase.type === "mfa_push"
  useEffect(() => {
    if (!open || !sessionId || !polling || busy) return
    const t = setTimeout(
      () => void call(() => api.pollSession(sessionId)),
      phase.type === "mfa_push" ? 300 : 1500
    )
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId, polling, busy, phase])

  const locked =
    phase.type === "syncing" ||
    phase.type === "success" ||
    (busy && phase.type !== "form")

  function close(next: boolean) {
    if (!next && locked) return
    if (!next && sessionId && phase.type !== "done")
      void api.cancelSession(sessionId).catch(() => {})
    onOpenChange(next)
  }

  const resync = !!connection
  const picking = phase.type === "pick"
  const choosingTd = phase.type === "td-method"

  return {
    provider,
    setProvider,
    phase,
    setPhase,
    sessionId,
    busy,
    username,
    setUsername,
    password,
    setPassword,
    remember,
    setRemember,
    mfaChoice,
    setMfaChoice,
    code,
    setCode,
    meta,
    call,
    start,
    close,
    locked,
    resync,
    picking,
    choosingTd,
    connection,
    full,
  }
}
