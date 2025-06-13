import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../scalars/components/fragments/popover/popover.js";

export interface AccountPopoverProps {
  children: ReactNode;
  content: ReactNode;
}

export const AccountPopover = ({ children, content }: AccountPopoverProps) => {
  return (
    <Popover>
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
