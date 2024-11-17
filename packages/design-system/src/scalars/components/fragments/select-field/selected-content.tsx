import React from "react";
import { ChevronDown, XCircle, XIcon } from "lucide-react";
import { Badge } from "@/scalars/components/fragments/badge";
import { Button } from "@/scalars/components/fragments/button";
import { Separator } from "@/scalars/components/fragments/separator";
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/types";

interface SelectedContentProps {
  selectedValues: string[];
  options?: SelectProps["options"];
  multiple: boolean;
  maxSelectedOptionsToShow: number;
  placeholder: string;
  disabled: boolean;
  toggleOption: (value: string) => void;
  handleClear: () => void;
  clearExtraOptions: () => void;
}

export const SelectedContent: React.FC<SelectedContentProps> = ({
  selectedValues,
  options = [],
  multiple,
  maxSelectedOptionsToShow,
  placeholder,
  disabled,
  toggleOption,
  handleClear,
  clearExtraOptions,
}) => {
  if (selectedValues.length === 0) {
    return (
      <div className="mx-auto flex w-full items-center justify-between">
        <span className="mx-3 text-sm text-gray-500 dark:text-gray-400">
          {placeholder}
        </span>
        <ChevronDown className="mx-2 h-4 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between">
      <div className={cn("flex flex-wrap items-center", !multiple && "w-full")}>
        {selectedValues.slice(0, maxSelectedOptionsToShow).map((value) => {
          const option = options.find((o) => o.value === value);
          const IconComponent = option?.icon;
          return (
            <Badge
              key={value}
              className={cn(
                "m-1 border-gray-200 text-gray-900",
                "transition duration-200 ease-in-out",
                multiple
                  ? [
                      "bg-white",
                      "hover:-translate-y-0.5 hover:scale-105",
                      "hover:bg-gray-50",
                    ]
                  : [
                      "w-full",
                      "bg-transparent",
                      "border-none",
                      "hover:bg-transparent",
                    ],
                "dark:border-gray-700 dark:text-gray-100",
                "dark:hover:bg-gray-700",
                "rounded-md",
              )}
            >
              {IconComponent && <IconComponent className="mr-2 size-4" />}
              {option?.label}
              {multiple && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleOption(value);
                  }}
                  className="ml-1 size-4 p-0 hover:bg-transparent"
                >
                  <XCircle className="size-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
                </Button>
              )}
            </Badge>
          );
        })}
        {multiple && selectedValues.length > maxSelectedOptionsToShow && (
          <Badge
            className={cn(
              "m-1",
              "transition duration-200 ease-in-out",
              "hover:-translate-y-0.5 hover:scale-105",
              "border-gray-200 bg-transparent text-gray-700",
              "hover:border-gray-300 hover:bg-gray-50",
              "dark:border-gray-700 dark:text-gray-300",
              "dark:hover:border-gray-600 dark:hover:bg-gray-700",
              "rounded-md",
            )}
          >
            {`+ ${selectedValues.length - maxSelectedOptionsToShow} more`}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearExtraOptions();
              }}
              className="ml-1 size-4 p-0 hover:bg-transparent"
            >
              <XCircle className="size-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
            </Button>
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between">
        {multiple && selectedValues.length > 0 && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClear();
              }}
              disabled={disabled}
              className="size-8 p-0 hover:bg-transparent"
            >
              <XIcon className="size-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
            </Button>
            <Separator orientation="vertical" className="flex h-full min-h-6" />
          </>
        )}
        <ChevronDown className="mx-2 h-4 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" />
      </div>
    </div>
  );
};
