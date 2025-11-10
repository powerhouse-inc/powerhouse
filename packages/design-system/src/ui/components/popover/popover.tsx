import { cn } from "@powerhousedao/design-system";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import React from "react";

export const Popover = PopoverPrimitive.Root;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ align = "center", sideOffset = 4, className, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        [
          "data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in",
          "data-[state=closed]:animate-zoom-out data-[state=open]:animate-zoom-in",
          "data-[side=bottom]:animate-slide-in-from-top data-[side=left]:animate-slide-in-from-right",
          "data-[side=right]:animate-slide-in-from-left data-[side=top]:animate-slide-in-from-bottom",
          "w-(--radix-popover-trigger-width) z-50 border p-0 outline-none",
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
