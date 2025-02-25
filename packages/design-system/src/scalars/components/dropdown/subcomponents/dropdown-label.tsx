import { cn } from "@/scalars/lib/utils";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import React from "react";

const DropdownLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "p-0.5 text-sm font-normal text-gray-700",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));

DropdownLabel.displayName = DropdownMenuPrimitive.Label.displayName;

export default DropdownLabel;
