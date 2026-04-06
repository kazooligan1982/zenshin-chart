"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group !z-[200000]"
      style={{ zIndex: 200000 }}
      position="bottom-center"
      closeButton={true}
      toastOptions={{
        className: "!z-[200000]",
        style: { zIndex: 200000, pointerEvents: "auto" },
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-zenshin-navy group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:px-4 group-[.toaster]:py-3",
          title: "group-[.toast]:text-sm group-[.toast]:font-medium",
          description: "group-[.toast]:text-xs group-[.toast]:text-gray-500",
          actionButton:
            "group-[.toast]:bg-zenshin-navy group-[.toast]:text-white group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:hover:bg-zenshin-navy/90 group-[.toast]:transition-colors",
          cancelButton:
            "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-600 group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs",
          closeButton:
            "group-[.toast]:text-gray-400 group-[.toast]:hover:text-gray-600",
          error:
            "group-[.toaster]:bg-red-50 group-[.toaster]:text-red-700 group-[.toaster]:border-red-200",
          success:
            "group-[.toaster]:bg-white group-[.toaster]:text-zenshin-navy group-[.toaster]:border-gray-200",
          info:
            "group-[.toaster]:bg-blue-50 group-[.toaster]:text-blue-700 group-[.toaster]:border-blue-200",
        },
      }}
      {...props}
    />
    </div>
  )
}

export { Toaster }
