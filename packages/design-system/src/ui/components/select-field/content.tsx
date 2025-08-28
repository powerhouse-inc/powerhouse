import { Icon } from "@powerhousedao/design-system";
import {
  cn,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  type SelectProps,
} from "@powerhousedao/design-system/ui";
import { useCommandState } from "cmdk";
import type React from "react";
import { useEffect } from "react";
import { CommandItemList } from "./subcomponents/CommandItemList.js";
interface ContentProps {
  searchable?: boolean;
  commandListRef: React.RefObject<HTMLDivElement>;
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
            <div className="my-1 border-b border-gray-300 dark:border-gray-600" />
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
