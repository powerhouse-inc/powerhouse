import React from "react";
import { CheckIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/scalars/components/fragments/command";
import { Separator } from "@/scalars/components/fragments/separator";
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/types";
import { Icon, type IconName } from "@/powerhouse/components/icon";

interface ContentProps {
  selectedValues: string[];
  options?: SelectProps["options"];
  optionsCheckmark: "Auto" | "None";
  multiple: boolean;
  searchable: boolean;
  toggleOption: (value: string) => void;
  toggleAll: () => void;
}

export const Content: React.FC<ContentProps> = ({
  selectedValues,
  options = [],
  optionsCheckmark,
  multiple,
  searchable,
  toggleOption,
  toggleAll,
}) => {
  const renderIcon = (
    IconComponent:
      | IconName
      | React.ComponentType<{ className?: string }>
      | undefined,
    disabled: boolean | undefined,
  ) => {
    if (typeof IconComponent === "string") {
      return (
        <Icon
          name={IconComponent}
          size={16}
          className={cn(
            "mr-2 text-gray-500 dark:text-gray-400",
            disabled && "opacity-75",
          )}
        />
      );
    }
    return (
      IconComponent && (
        <IconComponent
          className={cn(
            "mr-2 size-4 text-gray-500 dark:text-gray-400",
            disabled && "opacity-75",
          )}
        />
      )
    );
  };

  return (
    <Command
      className={cn(
        "rounded-lg border shadow-md",
        "border-gray-200 bg-white",
        "dark:border-gray-700 dark:bg-gray-800",
      )}
    >
      {searchable && (
        <CommandInput
          placeholder="Search..."
          className={cn(
            "h-9",
            "text-gray-900",
            "placeholder:text-gray-500",
            "dark:text-gray-100",
            "dark:placeholder:text-gray-400",
          )}
        />
      )}
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          {multiple && optionsCheckmark === "Auto" && (
            <>
              <CommandItem
                onSelect={toggleAll}
                className={cn(
                  "flex items-center justify-between",
                  "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900",
                )}
              >
                <div className="flex items-center">
                  <div
                    className={cn(
                      "mr-2 flex size-4 items-center justify-center rounded-sm border",
                      "border-gray-900 dark:border-gray-100",
                      selectedValues.length ===
                        options.filter((opt) => !opt.disabled).length
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "opacity-50 [&_svg]:invisible",
                    )}
                  >
                    <CheckIcon className="size-4" />
                  </div>
                  <span className="ml-2">
                    {selectedValues.length ===
                    options.filter((opt) => !opt.disabled).length
                      ? "Deselect All"
                      : "Select All"}
                  </span>
                </div>
              </CommandItem>
              <Separator />
            </>
          )}
          {options.map((option) => {
            const isSelected = selectedValues.includes(option.value);

            return (
              <CommandItem
                key={option.value}
                onSelect={() => !option.disabled && toggleOption(option.value)}
                className={cn(
                  "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900",
                  option.disabled &&
                    "cursor-not-allowed opacity-75 hover:bg-transparent dark:hover:bg-transparent",
                  optionsCheckmark === "None" &&
                    isSelected &&
                    "bg-gray-300 dark:bg-gray-700",
                )}
              >
                {optionsCheckmark === "Auto" && (
                  <>
                    {multiple ? (
                      <div
                        className={cn(
                          "mr-2 flex size-4 items-center justify-center rounded-sm border",
                          "border-gray-900 dark:border-gray-100",
                          isSelected
                            ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                            : "opacity-50 [&_svg]:invisible",
                          option.disabled && "opacity-75",
                        )}
                      >
                        <CheckIcon className="size-4" />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "mr-2 flex size-4 items-center justify-center rounded-full border",
                          isSelected
                            ? "border-gray-900 dark:border-gray-100"
                            : "border-gray-400 dark:border-gray-600",
                          "bg-white dark:bg-gray-800",
                          option.disabled && "opacity-75",
                        )}
                      >
                        {isSelected && (
                          <div className="size-2 rounded-full bg-gray-900 dark:bg-gray-100" />
                        )}
                      </div>
                    )}
                  </>
                )}
                {renderIcon(option.icon, option.disabled)}
                <span
                  className={cn(
                    "text-gray-900 dark:text-gray-100",
                    option.disabled && "text-gray-500 dark:text-gray-400",
                  )}
                >
                  {option.label}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
