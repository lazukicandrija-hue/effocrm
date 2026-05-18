import * as React from "react"
import { cn } from "@/lib/utils"

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "secondary" | "golf" | "casual" | "talking_head" | "dancing"
}) {
  const variants: Record<string, string> = {
    default: "bg-[#d4a853]/10 text-[#d4a853] border-[#d4a853]/20",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    secondary: "bg-gray-100 text-gray-600 border-gray-200",
    golf: "bg-green-50 text-green-700 border-green-200",
    casual: "bg-blue-50 text-blue-700 border-blue-200",
    talking_head: "bg-purple-50 text-purple-700 border-purple-200",
    dancing: "bg-pink-50 text-pink-700 border-pink-200",
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  )
}

export { Badge }
