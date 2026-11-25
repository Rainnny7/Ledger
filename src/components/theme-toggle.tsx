import { Hint } from "@/components/hint";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MoonStar, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useRef } from "react";
import { flushSync } from "react-dom";

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Light/dark switch. The sun and moon roll into each other, and the new theme spreads out from the
 * button in a circle (a view transition) where the browser supports it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const ref = useRef<HTMLButtonElement>(null);

  async function toggle() {
    const next = dark ? "light" : "dark";
    const apply = () => {
      // Swap the class right away so the view transition captures the new theme.
      flushSync(() => {
        document.documentElement.classList.toggle("dark", next === "dark");
        setTheme(next);
      });
    };
    if (
      !ref.current ||
      reducedMotion() ||
      !("startViewTransition" in document)
    ) {
      apply();
      return;
    }

    await document.startViewTransition(apply).ready;

    const { top, left, width, height } = ref.current.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 450,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  }

  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Hint label={label} side="bottom">
      <button
        ref={ref}
        type="button"
        aria-label={label}
        onClick={() => void toggle()}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative shrink-0 rounded-full",
          className,
        )}
      >
        <motion.span
          initial={false}
          animate={{ rotate: dark ? -90 : 0, scale: dark ? 0.01 : 1 }}
          transition={{ duration: 0.35 }}
          className="absolute flex"
        >
          <Sun className="size-4" />
        </motion.span>
        <motion.span
          initial={false}
          animate={{ rotate: dark ? 0 : 90, scale: dark ? 1 : 0.01 }}
          transition={{ duration: 0.35 }}
          className="absolute flex"
        >
          <MoonStar className="size-4" />
        </motion.span>
      </button>
    </Hint>
  );
}
