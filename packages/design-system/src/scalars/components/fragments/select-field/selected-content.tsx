import React from "react";
import { ChevronDown, ChevronsUpDown, XIcon } from "lucide-react";
import { Badge } from "@/scalars/components/fragments/badge";
import { Button } from "@/scalars/components/fragments/button";
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
  disabled?: boolean;
  handleClear: () => void;
}

export const SelectedContent: React.FC<SelectedContentProps> = ({
  selectedValues,
  options = [],
  multiple,
  searchable,
  maxSelectedOptionsToShow,
  placeholder,
  disabled,
  handleClear,
}) => {
  const renderIcon = (
    IconComponent:
      | IconName
      | React.ComponentType<{ className?: string }>
      | undefined,
  ) => {
    if (typeof IconComponent === "string") {
      return <Icon name={IconComponent} size={16} className="mr-2" />;
    }
    return IconComponent && <IconComponent className="mr-2 size-4" />;
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
          <ChevronsUpDown
            className="cursor-pointer text-gray-700 dark:text-gray-400"
            size={16}
          />
        ) : (
          <ChevronDown
            className="cursor-pointer text-gray-700 dark:text-gray-400"
            size={16}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div
        className={cn(
          "flex flex-wrap items-center gap-3",
          !multiple && "w-full",
        )}
      >
        {selectedValues.slice(0, maxSelectedOptionsToShow).map((value) => {
          const option = options.find((o) => o.value === value);
          return (
            <Badge
              key={value}
              className={cn(
                !multiple && "w-full",
                "text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-300",
                "border-none p-0",
              )}
            >
              {renderIcon(option?.icon)}
              {option?.label}
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
          <Button
            type="button"
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClear();
            }}
            disabled={disabled}
            className="size-4 p-0"
          >
            <XIcon
              className="cursor-pointer text-gray-700 dark:text-gray-400"
              size={16}
            />
          </Button>
        )}
        {searchable ? (
          <ChevronsUpDown
            className="cursor-pointer text-gray-700 dark:text-gray-400"
            size={16}
          />
        ) : (
          <ChevronDown
            className="cursor-pointer text-gray-700 dark:text-gray-400"
            size={16}
          />
        )}
      </div>
    </div>
  );
};
