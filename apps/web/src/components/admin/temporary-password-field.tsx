import { Dices } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PASSWORD_MAX, PasswordRules } from "@/components/common/password-rules"
import { randomPassword } from "@/components/admin/admin-user-utils"

/** A visible password field with a generator: it's temporary, and you'll need to pass it on. */
export function TemporaryPasswordField({
	id,
	value,
	onChange,
	autoFocus,
}: {
	id: string
	value: string
	onChange: (value: string) => void
	autoFocus?: boolean
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>Temporary Password</Label>
			<div className="flex gap-2">
				<Input
					id={id}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					autoComplete="off"
					spellCheck={false}
					className="font-mono"
					maxLength={PASSWORD_MAX}
					aria-describedby={`${id}-rules`}
					autoFocus={autoFocus}
					required
				/>
				<Button
					type="button"
					variant="outline"
					onClick={() => onChange(randomPassword())}
				>
					<Dices /> Generate
				</Button>
			</div>
			<PasswordRules id={`${id}-rules`} password={value} />
			<p className="text-xs text-muted-foreground">
				They have to choose their own password the next time they sign
				in, and this one stops working then.
			</p>
		</div>
	)
}
