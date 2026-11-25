import { Check, Circle } from "lucide-react"
import { checkPassword } from "../../../shared/password.ts"
import { cn } from "cn"

export {
	isStrongPassword,
	PASSWORD_MAX,
	PASSWORD_MIN,
} from "../../../shared/password.ts"

/** The password rules as a checklist that ticks off as you type. */
export function PasswordRules({
	password,
	id,
	className,
}: {
	password: string
	id?: string
	className?: string
}) {
	return (
		<ul
			id={id}
			className={cn("grid gap-1 text-xs sm:grid-cols-2", className)}
			aria-label="Password requirements"
		>
			{checkPassword(password).map((rule) => (
				<li
					key={rule.id}
					className={cn(
						"flex items-center gap-1.5 transition-colors",
						rule.ok
							? "text-emerald-600 dark:text-emerald-400"
							: "text-muted-foreground"
					)}
				>
					{rule.ok ? (
						<Check className="size-3.5 shrink-0" />
					) : (
						<Circle className="size-3 shrink-0 opacity-60" />
					)}
					<span>
						{rule.label}
						<span className="sr-only">
							{rule.ok ? " (done)" : " (missing)"}
						</span>
					</span>
				</li>
			))}
		</ul>
	)
}
