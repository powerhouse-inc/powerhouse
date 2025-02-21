import React, { useEffect } from "react";
import {
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/scalars/components/fragments/command";
import { useCommandState } from "cmdk";
import { cn } from "@/scalars/lib/utils";
import { IdAutocompleteListOption } from "./id-autocomplete-list-option";
import type { IdAutocompleteProps, IdAutocompleteOption } from "./types";

interface IdAutocompleteListProps {
  variant: IdAutocompleteProps["variant"];
  commandListRef?: React.RefObject<HTMLDivElement>;
  selectedValue?: string;
  options?: IdAutocompleteOption[];
  toggleOption?: (value: string) => void;
  renderOption?: (
    option: IdAutocompleteOption,
    displayProps?: {
      asPlaceholder?: boolean;
      showValue?: boolean;
      isLoadingSelectedOption?: boolean;
      handleFetchSelectedOption?: (value: string) => void;
      className?: string;
    },
  ) => React.ReactNode;
}

export const IdAutocompleteList: React.FC<IdAutocompleteListProps> = ({
  variant,
  commandListRef,
  selectedValue,
  options = [],
  toggleOption,
  renderOption,
}) => {
  const cmdkSearch = useCommandState((state) => state.search) as string;
  const defaultOption: IdAutocompleteOption = {
    value: "value not available",
    title: "Title not available",
    path: "Path not available",
    description: "Description not available",
  };

  useEffect(() => {
    commandListRef?.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [commandListRef, cmdkSearch]);

  return (
    <CommandList ref={commandListRef}>
      <CommandEmpty className={cn("h-full p-1")}>
        {renderOption ? (
          renderOption(defaultOption, {
            asPlaceholder: true,
            showValue: true,
            className: cn("pb-0"),
          })
        ) : (
          <IdAutocompleteListOption
            variant={variant}
            value="value not available"
            asPlaceholder
            className={cn("pb-0")}
          />
        )}
      </CommandEmpty>
      <CommandGroup className={cn("px-1")}>
        {options.map((opt) => {
          const isSelected = selectedValue === opt.value;

          return (
            <CommandItem
              key={opt.value}
              value={opt.value}
              onSelect={() => toggleOption?.(opt.value)}
              className={cn(
                "h-full cursor-pointer border-y-0 p-0",
                "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",
              )}
              role="option"
              aria-selected={isSelected}
            >
              {renderOption ? (
                renderOption(opt, {
                  asPlaceholder: false,
                  showValue: true,
                })
              ) : (
                <IdAutocompleteListOption variant={variant} {...opt} />
              )}
            </CommandItem>
          );
        })}
      </CommandGroup>
    </CommandList>
  );
};
