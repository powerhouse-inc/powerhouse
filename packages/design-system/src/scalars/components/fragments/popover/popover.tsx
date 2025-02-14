import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/scalars/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ align = "center", sideOffset = 4, className, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        [
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
          "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "z-50 w-[--radix-popover-trigger-width] border p-0 outline-none",
          "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-600",
          "rounded-md shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
        ],
        className,
      )}
      ref={ref}
      {...props}
    />
  </PopoverPrimitive.Portal>
));

export { Popover, PopoverAnchor, PopoverTrigger, PopoverContent };
