import type React from "react";
import { useEffect } from "react";
import {
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/scalars/components/fragments/command";
import { useCommandState } from "cmdk";
import { cn } from "@/scalars/lib/utils";
import { PHIDListItem } from "./phid-list-item";
import type { PHIDProps, PHIDItem } from "./types";

interface PHIDListProps {
  variant: PHIDProps["variant"];
  commandListRef?: React.RefObject<HTMLDivElement>;
  selectedValue?: string;
  options?: PHIDItem[];
  toggleOption?: (value: string) => void;
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
    commandListRef?.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [commandListRef, cmdkSearch]);

  return (
    <CommandList ref={commandListRef}>
      <CommandEmpty className={cn("h-full p-1")}>
        <PHIDListItem
          variant={variant}
          phid="phd:"
          asPlaceholder
          className={cn("pb-0")}
        />
      </CommandEmpty>
      <CommandGroup className={cn("px-1")}>
        {options.map((opt) => {
          const isSelected = selectedValue === opt.phid;

          return (
            <CommandItem
              key={opt.phid}
              value={opt.phid}
              onSelect={() => toggleOption?.(opt.phid)}
              className={cn(
                "h-full cursor-pointer border-y-0 p-0",
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
