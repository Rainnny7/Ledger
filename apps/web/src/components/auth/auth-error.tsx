import { CircleAlert } from "lucide-react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import type { AuthProblem } from "@/components/auth/auth-problem"

/** Error panel for the auth form: icon, title and message, announced to screen readers and animated in and out. */
export function AuthError({ problem }: { problem: AuthProblem | null }) {
	return (
		<LazyMotion features={domAnimation}>
			<AnimatePresence initial={false}>
				{problem && (
					<m.div
						key="problem"
						role="alert"
						className="overflow-hidden"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
					>
						<div className="pb-4">
							<div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
								<CircleAlert
									aria-hidden
									className="mt-0.5 size-4 shrink-0"
								/>
								<div className="grid gap-0.5">
									<p className="font-medium">
										{problem.title}
									</p>
									<p className="text-destructive/90">
										{problem.message}
									</p>
								</div>
							</div>
						</div>
					</m.div>
				)}
			</AnimatePresence>
		</LazyMotion>
	)
}
