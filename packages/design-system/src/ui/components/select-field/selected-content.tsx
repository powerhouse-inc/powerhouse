import type { IconName, SelectProps } from "@powerhousedao/design-system";
import { cn, Icon } from "@powerhousedao/design-system";
import React from "react";

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
    <div className="flex w-full items-center justify-between gap-2">
      <div
        className={cn(
          "max-w-full truncate text-gray-900 dark:text-gray-50",
          !multiple && "flex items-center gap-2",
        )}
      >
        {selectedValues.map((value, index) => {
          const option = options.find((o) => o.value === value);
          return !multiple ? (
            <React.Fragment key={value}>
              {renderIcon(option?.icon)}
              <span className="truncate text-[14px] font-normal leading-5">
                {option?.label}
              </span>
            </React.Fragment>
          ) : (
            <span
              key={value}
              className={cn(
                "text-[14px] font-normal leading-5",
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
