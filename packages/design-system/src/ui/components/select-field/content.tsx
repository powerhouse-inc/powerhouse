import { Icon } from "#design-system";
import { useCommandState } from "cmdk";
import React, { useEffect } from "react";
import { twMerge } from "tailwind-merge";
import {
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "../command/command.js";
import type { SelectProps } from "../enum-field/types.js";
import { CommandItemList } from "./subcomponents/CommandItemList.js";
interface ContentProps {
  searchable?: boolean;
  commandListRef: React.RefObject<HTMLDivElement | null>;
  multiple?: boolean;
  selectedValues: string[];
  selectionIcon: "auto" | "checkmark";
  selectionIconPosition: "left" | "right";
  options: SelectProps["options"];
  favoriteOptions?: SelectProps["options"];
  toggleAll: () => void;
  toggleOption: (value: string) => void;
}

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
  favoriteOptions = [],
}) => {
  const enabledOptions = options.filter((opt) => !opt.disabled);
  const hasAnyIcon = options.some((opt) => opt.icon);

  const cmdkSearch = useCommandState((state) => state.search);
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
          className="text-gray-800 dark:text-slate-100"
        />
      )}
      <CommandList ref={commandListRef} tabIndex={!searchable ? 0 : undefined}>
        <CommandEmpty className="p-4 text-center text-sm/5 font-normal text-gray-700 dark:text-slate-200">
          No results found.
        </CommandEmpty>
        {multiple && cmdkSearch === "" && (
          <CommandGroup className="pb-0">
            <CommandItem
              value="select-all"
              onSelect={toggleAll}
              disabled={false}
              className={twMerge(
                "cursor-pointer",
                "data-[selected=true]:bg-gray-100 dark:data-[selected=true]:bg-slate-600",
              )}
              role="option"
              aria-selected={selectedValues.length === enabledOptions.length}
            >
              <div className="flex w-full items-center gap-2">
                {selectionIcon === "auto" && (
                  <div
                    className={twMerge(
                      "flex size-4 items-center justify-center rounded-md border",
                      "border-gray-700 dark:border-slate-200",
                      selectedValues.length === enabledOptions.length &&
                        "bg-gray-900 text-gray-50 dark:bg-slate-50 dark:text-slate-900",
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
                            className="text-gray-800 dark:text-slate-100"
                          />
                        )}
                    </div>
                  )}
                <span className="text-sm/4 font-semibold text-gray-800 dark:text-slate-100">
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
                          className="text-gray-800 dark:text-slate-100"
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
          <CommandItemList
            options={favoriteOptions}
            selectedValues={selectedValues}
            multiple={multiple}
            selectionIcon={selectionIcon}
            selectionIconPosition={selectionIconPosition}
            hasAnyIcon={hasAnyIcon}
            toggleOption={toggleOption}
            tabIndex={!searchable ? 0 : undefined}
          />

          {favoriteOptions.length > 0 && (
            <div className="my-1 border-b border-gray-300 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100" />
          )}
          <CommandItemList
            options={options}
            selectedValues={selectedValues}
            multiple={multiple}
            selectionIcon={selectionIcon}
            selectionIconPosition={selectionIconPosition}
            hasAnyIcon={hasAnyIcon}
            toggleOption={toggleOption}
            tabIndex={!searchable ? 0 : undefined}
          />
        </CommandGroup>
      </CommandList>
    </>
  );
};
