import type { IconName } from "#design-system";
import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";
import React from "react";
import { CommandItem } from "../../command/command.js";
import type { SelectProps } from "../../enum-field/types.js";

interface FavoriteOptionsProps {
  options: SelectProps["options"];
  selectedValues: string[];
  multiple?: boolean;
  selectionIcon: "auto" | "checkmark";
  selectionIconPosition: "left" | "right";
  hasAnyIcon: boolean;
  toggleOption: (value: string) => void;
  tabIndex?: number;
}

const renderIcon = (
  IconComponent:
    | IconName
    | React.ComponentType<{ className?: string }>
    | undefined,
) => {
  if (typeof IconComponent === "string") {
    return (
      <Icon
        name={IconComponent}
        size={16}
        className={twMerge("text-gray-700 dark:text-slate-200")}
      />
    );
  }
  return (
    IconComponent && (
      <IconComponent
        className={twMerge("size-4", "text-gray-700 dark:text-slate-200")}
      />
    )
  );
};

export const CommandItemList: React.FC<FavoriteOptionsProps> = ({
  options = [],
  selectedValues,
  multiple,
  selectionIcon,
  selectionIconPosition,
  hasAnyIcon,
  toggleOption,
  tabIndex,
}) => {
  return (
    <>
      {options.map((opt) => {
        const isSelected = selectedValues.includes(opt.value);
        return (
          <CommandItem
            tabIndex={tabIndex}
            key={`favorite-${opt.value}`}
            value={opt.label}
            onSelect={() => !opt.disabled && toggleOption(opt.value)}
            disabled={opt.disabled}
            className={twMerge(
              "cursor-pointer",
              "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-slate-500",
              opt.disabled &&
                "pointer-events-auto! cursor-not-allowed hover:bg-transparent dark:hover:bg-slate-500",
            )}
            role="option"
            aria-selected={isSelected}
          >
            {selectionIcon === "auto" &&
              (multiple ? (
                <div
                  className={twMerge(
                    "flex size-4 items-center justify-center rounded-md border",
                    "border-gray-700 dark:border-slate-200",
                    isSelected &&
                      "bg-gray-900 text-gray-50 dark:bg-slate-50 dark:text-slate-900",
                  )}
                >
                  {isSelected && <Icon name="Checkmark" size={16} />}
                </div>
              ) : (
                <div
                  className={twMerge(
                    "relative size-4 rounded-full border",
                    isSelected
                      ? "border-gray-900 dark:border-slate-50"
                      : "border-gray-800 dark:border-slate-100",
                    "bg-transparent",
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-1/2 left-1/2 size-2.5 -translate-1/2 rounded-full bg-gray-900 dark:bg-slate-50" />
                  )}
                </div>
              ))}
            {selectionIcon === "checkmark" &&
              !(selectionIconPosition === "right" && hasAnyIcon) && (
                <div className="size-4">
                  {selectionIconPosition === "left" && isSelected && (
                    <Icon
                      name="Checkmark"
                      size={16}
                      className="text-gray-900 dark:text-slate-50"
                    />
                  )}
                </div>
              )}
            {renderIcon(opt.icon)}
            <span
              className={twMerge(
                "flex-1 truncate text-sm/4 font-normal",
                "text-gray-700 dark:text-slate-200",
                opt.disabled && "text-gray-700 dark:text-slate-200",
              )}
            >
              {opt.label}
            </span>
            {selectionIcon === "checkmark" &&
              selectionIconPosition === "right" && (
                <div className="size-4">
                  {isSelected && (
                    <Icon
                      name="Checkmark"
                      size={16}
                      className="text-gray-900 dark:text-slate-50"
                    />
                  )}
                </div>
              )}
          </CommandItem>
        );
      })}
    </>
  );
};
