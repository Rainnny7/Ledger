import { toast } from "sonner"
import { api, type Shared, type ShareKind } from "@/lib/api"

/** Singular noun for each shareable item type (toast copy). */
export const KIND_LABEL: Record<ShareKind, string> = {
	goal: "goal",
	subscription: "subscription",
	job: "job",
}

/** First name, else the part of the email before the @. */
export const shortName = (person: { name?: string | null; email: string }) =>
	person.name?.trim().split(/\s+/)[0] || person.email.split("@")[0]

/** Up to two initials for avatars and share lists. */
export const initials = (person: { name?: string | null; email: string }) => {
	const words = (person.name?.trim() || person.email)
		.split(/[\s@._-]+/)
		.filter(Boolean)
	return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase()
}

/** Stop seeing something someone shared with you. */
export async function leaveShared(
	kind: ShareKind,
	item: { id: string; name: string; owner: Shared["owner"] }
) {
	if (
		!confirm(
			`Remove “${item.name}” from your ${KIND_LABEL[kind]}s? ${item.owner?.name || "The owner"} can share it again.`
		)
	) {
		return
	}
	try {
		await api.leaveShare(kind, item.id)
		toast.success(`Removed ${item.name}`)
	} catch (error) {
		toast.error((error as Error).message)
	}
}

/** Your own items first, then the ones shared with you. */
export const splitShared = <T extends Shared>(items: T[]) => ({
	own: items.filter((item) => item.access === "owner"),
	shared: items.filter((item) => item.access !== "owner"),
})
