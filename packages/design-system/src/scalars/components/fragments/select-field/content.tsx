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
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { Icon, type IconName } from "@/powerhouse/components/icon";

interface ContentProps {
  selectedValues: string[];
  options?: SelectProps["options"];
  optionsCheckmark: "Auto" | "None";
  multiple?: boolean;
  searchable?: boolean;
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
    disabled?: boolean,
  ) => {
    if (typeof IconComponent === "string") {
      return (
        <Icon
          name={IconComponent}
          size={16}
          className={cn(
            "text-gray-700 dark:text-gray-400",
            disabled && "opacity-50",
          )}
        />
      );
    }
    return (
      IconComponent && (
        <IconComponent
          className={cn(
            "size-4",
            "text-gray-700 dark:text-gray-400",
            disabled && "opacity-50",
          )}
        />
      )
    );
  };

  return (
    <Command>
      {searchable && (
        <CommandInput
          placeholder="Search..."
          className={cn(
            "h-9 text-[14px] font-normal leading-5",
            "text-gray-700 dark:text-gray-500",
          )}
        />
      )}
      <CommandList>
        <CommandEmpty className="p-4 text-center text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-500">
          No results found.
        </CommandEmpty>
        <CommandGroup>
          {multiple && optionsCheckmark === "Auto" && (
            <CommandItem
              onSelect={toggleAll}
              className={cn(
                "flex items-center justify-between",
                "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900",
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex size-4 items-center justify-center rounded border",
                    "border-gray-700 dark:border-gray-400",
                    selectedValues.length ===
                      options.filter((opt) => !opt.disabled).length
                      ? "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black"
                      : "opacity-50 [&_svg]:invisible",
                  )}
                >
                  <CheckIcon className="size-4" />
                </div>
                <span className="text-[14px] font-semibold leading-[22px] text-gray-900 dark:text-gray-50">
                  {selectedValues.length ===
                  options.filter((opt) => !opt.disabled).length
                    ? "Deselect All"
                    : "Select All"}
                </span>
              </div>
            </CommandItem>
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
                          "flex size-4 items-center justify-center rounded border",
                          "border-gray-700 dark:border-gray-400",
                          isSelected
                            ? "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black"
                            : "opacity-50 [&_svg]:invisible",
                          option.disabled && "opacity-75",
                        )}
                      >
                        <CheckIcon className="size-4" />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "relative size-4 rounded-full border",
                          isSelected
                            ? "border-gray-900 dark:border-gray-400"
                            : "border-gray-800 dark:border-gray-400",
                          "bg-transparent dark:bg-transparent",
                          option.disabled && "opacity-75",
                        )}
                      >
                        {isSelected && (
                          <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-900 dark:bg-gray-400" />
                        )}
                      </div>
                    )}
                  </>
                )}
                {renderIcon(option.icon, option.disabled)}
                <span
                  className={cn(
                    "text-[14px] font-medium leading-[22px]",
                    "text-gray-700 dark:text-gray-400",
                    option.disabled && "text-gray-600 dark:text-gray-600",
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
