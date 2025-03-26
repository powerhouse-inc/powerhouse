import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import ChevronDown from "../../../../powerhouse/components/icon-components/ChevronDown.js";
import { cn } from "../../../../scalars/lib/utils.js";

export const DropdownTrigger: React.FC<
  React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>
> = ({ children, className, ...props }) => (
  <DropdownMenuPrimitive.Trigger
    {...props}
    className={cn(
      "flex h-9 w-full cursor-pointer items-center px-3 py-2 text-[14px] font-normal text-gray-900",
      "dark:border-charcoal-700 dark:bg-charcoal-900 rounded-md border border-gray-300 bg-white",
      "hover:border-gray-300 hover:bg-gray-100",
      "dark:hover:border-charcoal-700 dark:hover:bg-charcoal-800",
      "dark:focus:ring-charcoal-300 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:ring-offset-0",
      "dark:focus-visible:ring-charcoal-300 focus-visible:ring-1 focus-visible:ring-gray-900 focus-visible:ring-offset-0",

      className,
    )}
    asChild
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">{children}</div>
      <ChevronDown className="size-4" />
    </div>
  </DropdownMenuPrimitive.Trigger>
);
