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
}

export const SearchInput: React.FC<SearchInputProps> = ({
  selectedValues,
  options = [],
  placeholder,
  disabled,
}) => {
  const selectedOption = options.find((o) => o.value === selectedValues[0]);
  const [value, setValue] = useState(selectedOption?.label || "");

  const handleChange = (value: string) => {
    setValue(value);
  };

  useEffect(() => {
    setValue(selectedOption?.label || "");
  }, [selectedOption]);

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
            }}
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
