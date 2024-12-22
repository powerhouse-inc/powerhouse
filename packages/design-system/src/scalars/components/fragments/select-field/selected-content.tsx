import React from "react";
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { Icon } from "@/powerhouse/components/icon";

interface SelectedContentProps {
  selectedValues: string[];
  options: SelectProps["options"];
  multiple?: boolean;
  searchable?: boolean;
  placeholder?: string;
  handleClear: () => void;
}

export const SelectedContent: React.FC<SelectedContentProps> = ({
  selectedValues,
  options = [],
  multiple,
  searchable,
  placeholder,
  handleClear,
}) => {
  if (selectedValues.length === 0) {
    return (
      <div
        className={cn(
          "mx-auto flex w-full items-center",
          placeholder ? "justify-between" : "justify-end",
        )}
      >
        {placeholder && (
          <span className="text-[14px] font-normal leading-5 text-gray-600 dark:text-gray-500">
            {placeholder}
          </span>
        )}
        {searchable ? (
          <Icon
            name="CaretSort"
            size={16}
            className="cursor-pointer text-gray-700 dark:text-gray-400"
          />
        ) : (
          <Icon
            name="ChevronDown"
            size={16}
            className="cursor-pointer text-gray-700 dark:text-gray-400"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="max-w-full truncate text-gray-900 dark:text-gray-50">
        {selectedValues.map((value, index) => {
          const option = options.find((o) => o.value === value);
          return (
            <span
              key={`${value}-${index}`}
              className={cn(
                "text-[14px] font-normal leading-5 text-gray-900 dark:text-gray-50",
                "mr-1 p-0",
              )}
            >
              {index !== selectedValues.length - 1
                ? `${option?.label},`
                : option?.label}
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        {multiple && selectedValues.length > 0 && (
          <div
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClear();
            }}
            className="size-4 p-0"
          >
            <Icon
              name="XmarkLight"
              size={16}
              className="cursor-pointer text-gray-700 dark:text-gray-400"
            />
          </div>
        )}
        {searchable ? (
          <Icon
            name="CaretSort"
            size={16}
            className="cursor-pointer text-gray-700 dark:text-gray-400"
          />
        ) : (
          <Icon
            name="ChevronDown"
            size={16}
            className="cursor-pointer text-gray-700 dark:text-gray-400"
          />
        )}
      </div>
    </div>
  );
};
