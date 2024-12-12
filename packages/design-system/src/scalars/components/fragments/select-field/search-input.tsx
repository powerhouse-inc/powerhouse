import React, { useEffect } from "react";
import { Command, CommandInput } from "@/scalars/components/fragments/command";
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { Icon } from "@/powerhouse/components/icon";

interface SearchInputProps {
  selectedValues: string[];
  options?: SelectProps["options"];
  placeholder?: string;
  disabled?: boolean;
  searchValue?: string;
  onSearch?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSelectFirstOption?: () => void;
  handleClear?: () => void;
  isPopoverOpen?: boolean;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      selectedValues,
      options = [],
      placeholder,
      disabled,
      searchValue,
      onSearch,
      onOpenChange,
      onSelectFirstOption,
      handleClear,
      isPopoverOpen,
    },
    ref,
  ) => {
    const selectedOption = options.find((o) => o.value === selectedValues[0]);

    const handleChange = (value: string) => {
      if (selectedOption && selectedOption.label !== value) {
        handleClear?.();
      }
      onSearch?.(value);
      onOpenChange?.(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (isPopoverOpen) {
          onSelectFirstOption?.();
        } else {
          onOpenChange?.(true);
        }
      }
    };

    useEffect(() => {
      onSearch?.(selectedOption?.label ?? searchValue ?? "");
    }, [onSearch, selectedOption, searchValue]);

    return (
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex w-full items-center">
          <Command>
            <CommandInput
              ref={ref}
              value={searchValue}
              onValueChange={handleChange}
              placeholder={placeholder}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenChange?.(true);
              }}
              onKeyDown={handleKeyDown}
              wrapperClassName={cn(
                "group mt-0 border-0 border-none px-0",
                "hover:bg-gray-100! dark:hover:bg-charcoal-800!",
                "focus-within:bg-white! dark:focus-within:bg-charcoal-900!",
              )}
              className={cn(
                "py-0 text-gray-900 dark:text-gray-50",
                "group-hover:bg-gray-100! dark:group-hover:bg-charcoal-800!",
              )}
              disabled={disabled}
            />
          </Command>
        </div>
        <Icon
          name="ChevronDown"
          size={16}
          className="cursor-pointer text-gray-700 dark:text-gray-400"
        />
      </div>
    );
  },
);
