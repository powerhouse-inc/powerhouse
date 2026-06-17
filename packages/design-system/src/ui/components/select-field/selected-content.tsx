import type { IconName } from "#design-system";
import { Icon } from "#design-system";
import { twMerge } from "tailwind-merge";
import React from "react";
import type { SelectProps } from "../enum-field/types.js";

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
        className={twMerge(
          "mx-auto flex w-full items-center",
          placeholder ? "justify-between" : "justify-end",
        )}
      >
        {placeholder && (
          <span className="text-sm/5 font-normal text-foreground">
            {placeholder}
          </span>
        )}
        {searchable ? (
          <Icon
            name="CaretSort"
            size={16}
            className="cursor-pointer text-foreground"
          />
        ) : (
          <Icon
            name="ChevronDown"
            size={16}
            className="cursor-pointer text-foreground"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div
        className={twMerge(
          "max-w-full truncate text-foreground",
          !multiple && "flex items-center gap-2",
        )}
      >
        {selectedValues.map((value, index) => {
          const option = options.find((o) => o.value === value);
          return !multiple ? (
            <React.Fragment key={value}>
              {renderIcon(option?.icon)}
              <span className="truncate text-sm/5 font-normal">
                {option?.label}
              </span>
            </React.Fragment>
          ) : (
            <span
              key={value}
              className={twMerge(
                "text-sm/5 font-normal",
                index !== selectedValues.length - 1 && "mr-1",
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
              className="cursor-pointer text-foreground"
            />
          </div>
        )}
        {searchable ? (
          <Icon
            name="CaretSort"
            size={16}
            className="cursor-pointer text-foreground"
          />
        ) : (
          <Icon
            name="ChevronDown"
            size={16}
            className="cursor-pointer text-foreground"
          />
        )}
      </div>
    </div>
  );
};
