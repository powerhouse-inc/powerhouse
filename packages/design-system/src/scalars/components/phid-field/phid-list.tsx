import React, { useEffect } from "react";
import {
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/scalars/components/fragments/command";
import { useCommandState } from "cmdk";
import { cn } from "@/scalars/lib/utils";
import { PHIDListItem } from "./phid-list-item";
import type { PHIDProps, PHIDListItemProps } from "./types";

interface PHIDListProps {
  variant?: PHIDProps["variant"];
  commandListRef: React.RefObject<HTMLDivElement>;
  selectedValue: string;
  options?: PHIDListItemProps[];
  toggleOption: (value: string) => void;
}

export const PHIDList: React.FC<PHIDListProps> = ({
  variant,
  commandListRef,
  selectedValue,
  options = [],
  toggleOption,
}) => {
  const cmdkSearch = useCommandState((state) => state.search) as string;

  useEffect(() => {
    commandListRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [commandListRef, cmdkSearch]);

  return (
    <CommandList ref={commandListRef}>
      <CommandEmpty
        className={cn(
          "p-4 text-center text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-400",
        )}
      >
        No results found.
      </CommandEmpty>
      <CommandGroup>
        {options.map((opt) => {
          const isSelected = selectedValue === opt.phid;

          return (
            <CommandItem
              key={opt.phid}
              value={opt.phid}
              onSelect={() => toggleOption(opt.phid)}
              className={cn(
                "h-full cursor-pointer",
                "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",
              )}
              role="option"
              aria-selected={isSelected}
            >
              <PHIDListItem variant={variant} {...opt} />
            </CommandItem>
          );
        })}
      </CommandGroup>
    </CommandList>
  );
};
