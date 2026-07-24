import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "#design-system/ui";

export interface AccountPopoverProps {
  children: ReactNode;
  content: ReactNode;
  // Optional controlled open state; omit for the default uncontrolled popover.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const AccountPopover = ({
  children,
  content,
  open,
  onOpenChange,
}: AccountPopoverProps) => {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open Account"
          className="cursor-pointer"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        {content}
      </PopoverContent>
    </Popover>
  );
};
