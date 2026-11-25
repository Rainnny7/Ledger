import { useSession } from "@/lib/auth-client"
import { DEMO_IDENTITY, demoMode } from "@/lib/demo"
import { useNow } from "@/lib/use-now"

/** "Good morning, Sam", by the clock on this device. */
export function Greeting() {
  const { data } = useSession()
  const hour = useNow().getHours()
  const part =
    hour < 5
      ? "evening"
      : hour < 12
        ? "morning"
        : hour < 17
          ? "afternoon"
          : "evening"
  // Demo mode shows the made-up person, never the signed-in user's own name.
  const name = demoMode ? DEMO_IDENTITY.name : data?.user.name
  const first = name?.trim().split(/\s+/)[0]
  return <>{`Good ${part}${first ? `, ${first}` : ""}`}</>
}
