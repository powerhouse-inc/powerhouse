import { Popover, PopoverContent, PopoverTrigger } from "#ui";
import type { ReactNode } from "react";

export interface AccountPopoverProps {
  children: ReactNode;
  content: ReactNode;
}

export const AccountPopover = ({ children, content }: AccountPopoverProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="cursor-pointer">{children}</div>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        {content}
      </PopoverContent>
    </Popover>
  );
};
