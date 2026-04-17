"use client"

import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
  type PanelImperativeHandle,
} from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: GroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  panelRef,
  ...props
}: PanelProps & {
  panelRef?: React.Ref<PanelImperativeHandle>;
}) {
  return <Panel panelRef={panelRef} data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "group relative flex w-1 items-center justify-center bg-transparent transition-all hover:bg-gradient-to-b hover:from-blue-500/20 hover:to-green-500/20 cursor-col-resize data-[panel-group-orientation=vertical]:h-1 data-[panel-group-orientation=vertical]:w-full data-[panel-group-orientation=vertical]:flex-col data-[panel-group-orientation=vertical]:cursor-row-resize data-[panel-group-orientation=vertical]:hover:bg-gradient-to-r data-[panel-group-orientation=vertical]:hover:from-blue-500/20 data-[panel-group-orientation=vertical]:hover:to-green-500/20",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="absolute z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-gradient-to-br from-blue-500 to-green-500 rounded border border-blue-400/50 shadow-lg p-1.5 transition-all group-hover:scale-110">
            <GripVerticalIcon className="size-3 text-white data-[panel-group-orientation=vertical]:hidden" />
            <GripVerticalIcon className="hidden size-3 rotate-90 text-white data-[panel-group-orientation=vertical]:block" />
          </div>
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
