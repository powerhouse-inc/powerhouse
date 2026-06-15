import type { IconName } from "#design-system";
import { Icon } from "#design-system";
import React from "react";
import { twMerge } from "tailwind-merge";
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
        className={twMerge("text-foreground")}
      />
    );
  }
  return (
    IconComponent && (
      <IconComponent className={twMerge("size-4", "text-foreground")} />
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
              "data-[selected=true]:bg-accent",
              opt.disabled &&
                "pointer-events-auto! cursor-not-allowed hover:hover-effect",
            )}
            role="option"
            aria-selected={isSelected}
          >
            {selectionIcon === "auto" &&
              (multiple ? (
                <div
                  className={twMerge(
                    "flex size-4 items-center justify-center rounded-md border",
                    "border-foreground",
                    isSelected && "bg-primary text-primary-foreground",
                  )}
                >
                  {isSelected && <Icon name="Checkmark" size={16} />}
                </div>
              ) : (
                <div
                  className={twMerge(
                    "relative size-4 rounded-full border",
                    isSelected ? "border-foreground" : "border-foreground",
                    "bg-transparent",
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-1/2 left-1/2 size-2.5 -translate-1/2 rounded-full bg-primary" />
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
                      className="text-foreground"
                    />
                  )}
                </div>
              )}
            {renderIcon(opt.icon)}
            <span
              className={twMerge(
                "flex-1 truncate text-sm/4 font-normal",
                "text-foreground",
                opt.disabled && "text-foreground",
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
                      className="text-foreground"
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
