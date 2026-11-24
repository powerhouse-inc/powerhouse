import type { Ref } from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "../lib/cn.js";

type ViewportProps = Omit<
  ScrollAreaPrimitive.Viewport.Props,
  "className" | "children"
> & { [data: `data-${string}`]: string | undefined };

function ScrollArea({
  className,
  children,
  viewportRef,
  viewportProps,
  orientation = "both",
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportRef?: Ref<HTMLDivElement>;
  viewportProps?: ViewportProps;
  orientation?: "both" | "vertical" | "horizontal";
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative flex min-h-0 flex-col", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        ref={viewportRef}
        {...viewportProps}
        style={{
          ...viewportProps?.style,
          ...(orientation === "horizontal" && { overflowY: "hidden" }),
          ...(orientation === "vertical" && { overflowX: "hidden" }),
        }}
        className="grid min-h-0 flex-1 grid-rows-[minmax(100%,max-content)] rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        <ScrollAreaPrimitive.Content data-slot="scroll-area-content">
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };
