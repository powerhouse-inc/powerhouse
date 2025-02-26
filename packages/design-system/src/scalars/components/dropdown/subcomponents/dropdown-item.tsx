import React from "react";
import { cn } from "@/scalars/lib/utils";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

export const DropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn([
      "focus:bg-accent focus:text-accent-foreground relative flex select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
      "cursor-pointer gap-2 font-normal text-gray-700 pl-3",
      inset && "pl-8",
      "hover:bg-gray-100",
      className,
    ])}
    {...props}
  />
));
DropdownItem.displayName = "DropdownItem";
