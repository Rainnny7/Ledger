"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, TriangleAlertIcon, XIcon, Loader2Icon } from "lucide-react"

/*
 * Toasts sit at the bottom of the screen and look like the rest of the app: a popover-coloured
 * card with a soft shadow and a small tinted icon chip, rather than sonner's solid rich colours.
 * The finer styling lives in index.css under [data-sonner-toaster].
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      offset={20}
      mobileOffset={16}
      gap={10}
      icons={{
        success: <CheckIcon className="size-3.5" strokeWidth={2.75} />,
        info: <InfoIcon className="size-3.5" strokeWidth={2.5} />,
        warning: <TriangleAlertIcon className="size-3.5" strokeWidth={2.5} />,
        error: <XIcon className="size-3.5" strokeWidth={2.75} />,
        loading: <Loader2Icon className="size-3.5 animate-spin" strokeWidth={2.5} />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "calc(var(--radius) * 1.4)",
          "--width": "380px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
