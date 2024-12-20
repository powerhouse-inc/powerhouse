import React from "react";
import { Badge } from "@/scalars/components/fragments/badge";
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { Icon, type IconName } from "@/powerhouse/components/icon";

interface SelectedContentProps {
  selectedValues: string[];
  options?: SelectProps["options"];
  multiple?: boolean;
  searchable?: boolean;
  maxSelectedOptionsToShow: number;
  placeholder?: string;
  handleClear: () => void;
}

export const SelectedContent: React.FC<SelectedContentProps> = ({
  selectedValues,
  options = [],
  multiple,
  searchable,
  maxSelectedOptionsToShow,
  placeholder,
  handleClear,
}) => {
  const renderIcon = (
    IconComponent:
      | IconName
      | React.ComponentType<{ className?: string }>
      | undefined,
  ) => {
    if (typeof IconComponent === "string") {
      return <Icon name={IconComponent} size={16} />;
    }
    return IconComponent && <IconComponent className="size-4" />;
  };

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
      <div className="flex w-full flex-wrap items-center gap-3 overflow-hidden">
        {selectedValues.slice(0, maxSelectedOptionsToShow).map((value) => {
          const option = options.find((o) => o.value === value);
          return (
            <Badge
              key={value}
              className={cn(
                "max-w-full",
                "text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-300",
                "border-none p-0",
                "flex items-center gap-2",
              )}
            >
              {renderIcon(option?.icon)}
              <span className="truncate">{option?.label}</span>
            </Badge>
          );
        })}
        {multiple && selectedValues.length > maxSelectedOptionsToShow && (
          <Badge className="border-none p-0 text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-300">
            {`+ ${selectedValues.length - maxSelectedOptionsToShow} more`}
          </Badge>
        )}
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
