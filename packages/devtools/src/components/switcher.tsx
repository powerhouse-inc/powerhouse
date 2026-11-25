import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { includesSearch } from "../lib/search.js";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";
import type { DataAttributes } from "../lib/data-attributes.js";

/** The chosen item's name as a button that opens a searchable list of the
 * items, to choose another. */
export function Switcher<T>({
  items,
  selected,
  itemKey,
  name,
  searchText,
  onSelect,
  renderItem,
  tooltip,
  searchLabel,
  noMatch,
  testId,
  itemData,
  className,
}: {
  items: readonly T[];
  selected: T;
  itemKey: (item: T) => string;
  name: (item: T) => string;
  searchText: (item: T) => string[];
  onSelect: (item: T) => void;
  renderItem: (item: T) => ReactNode;
  tooltip: string;
  searchLabel: string;
  noMatch: ReactNode;
  testId: string;
  itemData?: (item: T) => DataAttributes;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedKey = itemKey(selected);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-testid={`${testId}-switcher`}
            title={tooltip}
            className={cn(
              "-mx-1.5 flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted",
              className,
            )}
          >
            <span
              data-testid={`${testId}-name`}
              className="min-w-0 break-words"
            >
              {name(selected)}
            </span>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        }
      />
      <PopoverContent className="w-80 max-w-[90vw]">
        <Command
          className="rounded-lg! p-0"
          filter={(_key, search, keywords = []) =>
            includesSearch(keywords, search) ? 1 : 0
          }
        >
          <CommandInput
            placeholder={searchLabel}
            aria-label={searchLabel}
            data-testid={`${testId}-search`}
          />
          <CommandList className="p-1">
            <CommandEmpty className="py-4 text-[12px] text-muted-foreground">
              {noMatch}
            </CommandEmpty>
            {items.map((item) => {
              const key = itemKey(item);
              return (
                <CommandItem
                  key={key}
                  value={key}
                  keywords={searchText(item)}
                  data-checked={key === selectedKey}
                  data-testid={`${testId}-option`}
                  {...itemData?.(item)}
                  onSelect={() => {
                    setOpen(false);
                    onSelect(item);
                  }}
                  className="items-start py-1.5 text-xs"
                >
                  {renderItem(item)}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
