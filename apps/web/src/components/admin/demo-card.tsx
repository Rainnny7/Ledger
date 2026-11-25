import { Dices, Loader2, MonitorPlay } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { DEMO_PERSONAS, setDemoMode } from "@/lib/demo"
import { adminFetch } from "@/lib/admin"
import { queryClient } from "@/lib/queries"

/** Demo UI card. */
export function DemoCard() {
	const [reseeding, setReseeding] = useState(false)

	async function reseed() {
		setReseeding(true)
		try {
			await adminFetch("demo/reseed", { method: "POST" })
			// Anything cached from an earlier demo session is stale now.
			void queryClient.invalidateQueries()
			toast.success("Demo data reseeded")
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setReseeding(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Demo mode</CardTitle>
				<CardDescription>
					Browse the whole app filled with made-up accounts and
					transactions, handy for showing it off without your real
					balances on screen.
				</CardDescription>
				<CardAction className="flex flex-wrap justify-end gap-2">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => void reseed()}
						disabled={reseeding}
					>
						{reseeding ? (
							<Loader2 className="animate-spin" />
						) : (
							<Dices />
						)}{" "}
						Reseed
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-2 sm:grid-cols-2">
				{DEMO_PERSONAS.map((persona) => (
					<Button
						key={persona.id}
						variant="outline"
						className="h-auto justify-start gap-3 px-3 py-2 text-left whitespace-normal"
						onClick={() => setDemoMode(true, persona.id)}
					>
						<MonitorPlay className="shrink-0" />
						<span className="grid">
							<span className="font-medium">
								{persona.label} · {persona.name}
							</span>
							<span className="text-xs font-normal text-muted-foreground">
								{persona.blurb}
							</span>
						</span>
					</Button>
				))}
			</CardContent>
		</Card>
	)
}
