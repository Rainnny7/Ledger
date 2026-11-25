import { Hint } from "@/components/common/hint"
import {
  GOAL_COLORS,
  GOAL_ICONS,
  accentStyle,
} from "@/components/goals/goal-meta"
import { Label } from "@/components/ui/label"
import { cn } from "cn"

export function GoalIconPicker({
  icon,
  onIcon,
}: {
  icon: string
  onIcon: (key: string) => void
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label>Icon</Label>
      <div className="grid grid-cols-8 gap-1.5">
        {Object.entries(GOAL_ICONS).map(([key, { icon: Icon, label }]) => (
          <Hint key={key} label={label}>
            <button
              type="button"
              aria-label={label}
              aria-pressed={icon === key}
              onClick={() => onIcon(key)}
              className={cn(
                "grid aspect-square place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                icon === key &&
                  "border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              )}
            >
              <Icon className="size-4" />
            </button>
          </Hint>
        ))}
      </div>
    </div>
  )
}

export function GoalColorPicker({
  color,
  onColor,
}: {
  color: string
  onColor: (key: string) => void
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label>Colour</Label>
      <div className="flex flex-wrap gap-2">
        {Object.entries(GOAL_COLORS).map(([key, c]) => (
          <Hint key={key} label={c.label}>
            <button
              type="button"
              aria-label={c.label}
              aria-pressed={color === key}
              onClick={() => onColor(key)}
              className={cn(
                "size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                color === key && "ring-2 ring-foreground/70"
              )}
              style={accentStyle(key)}
            />
          </Hint>
        ))}
      </div>
    </div>
  )
}
