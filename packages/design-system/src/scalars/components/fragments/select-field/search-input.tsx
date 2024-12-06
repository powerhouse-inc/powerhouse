import React, { useState, useEffect } from "react";
import { Command, CommandInput } from "@/scalars/components/fragments/command";
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { Icon } from "@/powerhouse/components/icon";

interface SearchInputProps {
  selectedValues: string[];
  options?: SelectProps["options"];
  placeholder?: string;
  disabled?: boolean;
  onSearch?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSelectFirstOption?: () => void;
  handleClear?: () => void;
  isPopoverOpen?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  selectedValues,
  options = [],
  placeholder,
  disabled,
  onSearch,
  onOpenChange,
  onSelectFirstOption,
  handleClear,
  isPopoverOpen,
}) => {
  const selectedOption = options.find((o) => o.value === selectedValues[0]);
  const [value, setValue] = useState(selectedOption?.label || "");

  const handleChange = (value: string) => {
    if (value !== selectedOption?.label) {
      handleClear?.();
    }
    setValue(value);
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
    if (selectedValues.length > 0) {
      setValue(selectedOption?.label || "");
    }
  }, [selectedValues, selectedOption]);

  useEffect(() => {
    if (isPopoverOpen) {
      const input = document.querySelector("input[cmdk-input]");
      if (input) {
        setTimeout(() => {
          (input as HTMLInputElement).focus();
        }, 100);
      }
    }
  }, [isPopoverOpen]);

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex w-full items-center">
        <Command>
          <CommandInput
            value={value}
            onValueChange={handleChange}
            placeholder={placeholder}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenChange?.(true);
            }}
            onKeyDown={handleKeyDown}
            wrapperClassName={cn("group mt-0 border-0 border-none px-0")}
            className={cn("py-0")}
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
};
