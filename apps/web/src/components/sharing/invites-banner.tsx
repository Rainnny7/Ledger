import { Check, Mail, X } from "lucide-react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import { api, type ShareInvite } from "@/lib/api"
import { useInvites } from "@/lib/queries"
import { KIND_LABEL } from "@/lib/sharing"

async function respond(invite: ShareInvite, accept: boolean) {
	try {
		if (accept) {
			await api.acceptInvite(invite.id)
		} else {
			await api.declineInvite(invite.id)
		}
		toast.success(
			accept ? `Added ${invite.name}` : `Declined ${invite.name}`
		)
	} catch (error) {
		toastError((error as Error).message)
	}
}

/**
 * Invitations to see someone else's goal, subscription or job. Nothing is shared with you until you
 * accept, and sign-up emails aren't verified, so each one says who is inviting you.
 */
export function InvitesBanner({ enabled }: { enabled: boolean }) {
	const invites = useInvites(enabled).data?.invites ?? []
	if (invites.length === 0) {
		return null
	}

	return (
		<ul className="mb-6 grid gap-2">
			{invites.map((i) => (
				<li
					key={i.id}
					className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
				>
					<Mail
						className="size-4 shrink-0 text-primary"
						aria-hidden
					/>
					<p className="min-w-0 flex-1">
						<span className="font-medium">
							{i.owner.name || i.owner.email}
						</span>{" "}
						<span className="text-muted-foreground">
							({i.owner.email})
						</span>{" "}
						wants to share the {KIND_LABEL[i.kind]}{" "}
						<span className="font-medium">{i.name}</span> with you (
						{i.permission === "edit" ? "you can edit" : "view only"}
						). Only accept if you know them.
					</p>
					<div className="flex gap-2">
						<Button size="sm" onClick={() => void respond(i, true)}>
							<Check /> Accept
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void respond(i, false)}
						>
							<X /> Decline
						</Button>
					</div>
				</li>
			))}
		</ul>
	)
}
