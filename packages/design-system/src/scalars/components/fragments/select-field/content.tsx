/* eslint-disable react/jsx-max-depth */
import React, { useEffect } from "react";
import {
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/scalars/components/fragments/command";
import { useCommandState } from "cmdk";
import { cn } from "@/scalars/lib/utils";
import { SelectProps } from "@/scalars/components/enum-field/types";
import { Icon, type IconName } from "@/powerhouse/components/icon";

interface ContentProps {
  searchable?: boolean;
  commandListRef: React.RefObject<HTMLDivElement>;
  multiple?: boolean;
  selectedValues: string[];
  selectionIcon: "auto" | "checkmark";
  selectionIconPosition: "left" | "right";
  options: SelectProps["options"];
  toggleAll: () => void;
  toggleOption: (value: string) => void;
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
        className={cn("text-gray-700 dark:text-gray-400")}
      />
    );
  }
  return (
    IconComponent && (
      <IconComponent
        className={cn("size-4", "text-gray-700 dark:text-gray-400")}
      />
    )
  );
};

export const Content: React.FC<ContentProps> = ({
  searchable,
  commandListRef,
  multiple,
  selectedValues,
  selectionIcon,
  selectionIconPosition,
  options = [],
  toggleAll,
  toggleOption,
}) => {
  const enabledOptions = options.filter((opt) => !opt.disabled);
  const hasAnyIcon = options.some((opt) => opt.icon);

  const cmdkSearch = useCommandState((state) => state.search) as string;
  // scroll to top when search change
  useEffect(() => {
    commandListRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [commandListRef, cmdkSearch]);

  return (
    <>
      {searchable && (
        <CommandInput
          placeholder="Search..."
          onKeyDown={(e) => {
            const isOptionsRelatedKey = [
              "ArrowUp",
              "ArrowDown",
              "Enter",
            ].includes(e.key);
            if (!(isOptionsRelatedKey && enabledOptions.length > 0)) {
              e.stopPropagation();
            }
          }}
          wrapperClassName="rounded-t"
          className="text-gray-900 dark:text-gray-50"
        />
      )}
      <CommandList ref={commandListRef} tabIndex={!searchable ? 0 : undefined}>
        <CommandEmpty className="p-4 text-center text-[14px] font-normal leading-5 text-gray-700 dark:text-gray-400">
          No results found.
        </CommandEmpty>
        {multiple && cmdkSearch === "" && (
          <CommandGroup className="pb-0">
            <CommandItem
              value="select-all"
              onSelect={toggleAll}
              disabled={false}
              className={cn(
                "cursor-pointer",
                "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",
              )}
              role="option"
              aria-selected={selectedValues.length === enabledOptions.length}
            >
              <div className="flex w-full items-center gap-2">
                {selectionIcon === "auto" && (
                  <div
                    className={cn(
                      "flex size-4 items-center justify-center rounded-md border",
                      "border-gray-700 dark:border-gray-400",
                      selectedValues.length === enabledOptions.length &&
                        "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black",
                    )}
                  >
                    {selectedValues.length === enabledOptions.length && (
                      <Icon name="Checkmark" size={16} />
                    )}
                  </div>
                )}
                {selectionIcon === "checkmark" &&
                  !(selectionIconPosition === "right" && hasAnyIcon) && (
                    <div className="size-4">
                      {selectionIconPosition === "left" &&
                        selectedValues.length === enabledOptions.length && (
                          <Icon
                            name="Checkmark"
                            size={16}
                            className="text-gray-900 dark:text-gray-50"
                          />
                        )}
                    </div>
                  )}
                <span className="text-[14px] font-semibold leading-4 text-gray-900 dark:text-gray-50">
                  {selectedValues.length === enabledOptions.length
                    ? "Deselect All"
                    : "Select All"}
                </span>
                {selectionIcon === "checkmark" &&
                  selectionIconPosition === "right" && (
                    <div className="ml-auto size-4">
                      {selectedValues.length === enabledOptions.length && (
                        <Icon
                          name="Checkmark"
                          size={16}
                          className="text-gray-900 dark:text-gray-50"
                        />
                      )}
                    </div>
                  )}
              </div>
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup
          className={multiple && cmdkSearch === "" ? "pt-0" : undefined}
        >
          {options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);

            return (
              <CommandItem
                key={opt.value}
                value={opt.label}
                onSelect={() => !opt.disabled && toggleOption(opt.value)}
                disabled={opt.disabled}
                className={cn(
                  "cursor-pointer",
                  "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-gray-900",
                  opt.disabled &&
                    "!pointer-events-auto cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent",
                )}
                role="option"
                aria-selected={isSelected}
              >
                {selectionIcon === "auto" &&
                  (multiple ? (
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-md border",
                        "border-gray-700 dark:border-gray-400",
                        isSelected &&
                          "bg-gray-900 text-slate-50 dark:bg-gray-400 dark:text-black",
                      )}
                    >
                      {isSelected && <Icon name="Checkmark" size={16} />}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "relative size-4 rounded-full border",
                        isSelected
                          ? "border-gray-900 dark:border-gray-400"
                          : "border-gray-800 dark:border-gray-400",
                        "bg-transparent dark:bg-transparent",
                      )}
                    >
                      {isSelected && (
                        <div className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-900 dark:bg-gray-400" />
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
                          className="text-gray-900 dark:text-gray-50"
                        />
                      )}
                    </div>
                  )}
                {renderIcon(opt.icon)}
                <span
                  className={cn(
                    "flex-1 truncate text-[14px] font-medium leading-4",
                    "text-gray-700 dark:text-gray-500",
                    opt.disabled && "text-gray-600 dark:text-gray-600",
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
                          className="text-gray-900 dark:text-gray-50"
                        />
                      )}
                    </div>
                  )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </>
  );
};
