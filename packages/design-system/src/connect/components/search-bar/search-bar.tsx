import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from "@powerhousedao/design-system";
import { cn } from "@powerhousedao/design-system/ui";
import type { ChangeEvent } from "react";
import { useMemo } from "react";
import { twMerge } from "tailwind-merge";
import type { FilterItemType } from "./filter-item.js";
import { FilterItem } from "./filter-item.js";

export interface ConnectSearchBarProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  filterLabel?: string;
  filterItems?: Array<FilterItemType>;
  selectedFilter?: string;
  onFilterSelect?: (filterId: string) => void;
  className?: string;
}

export const ConnectSearchBar: React.FC<ConnectSearchBarProps> = (props) => {
  const {
    value,
    onChange,
    placeholder,
    filterLabel,
    filterItems,
    selectedFilter,
    onFilterSelect = () => {},
    className,
  } = props;

  const items = useMemo(
    () =>
      filterItems?.map((item) => ({
        id: item.id,
        content: <FilterItem item={item} />,
      })) ?? [],
    [filterItems],
  );

  const selectedItemFilter = filterItems?.find(
    (item) => item.id === selectedFilter,
  );

  const filterLabelContent = selectedItemFilter ? (
    <FilterItem className="gap-x-1" item={selectedItemFilter} />
  ) : (
    filterLabel && (
      <div className="mr-2 text-sm font-semibold text-slate-200">
        {filterLabel}
      </div>
    )
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value);
  }

  return (
    <div className={cn("flex items-center", className)}>
      <Icon className="mr-3" name="Search" />
      <input
        className={twMerge(
          "flex h-[52px] min-w-0 flex-1 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-slate-200 outline-none",
        )}
        onChange={handleChange}
        placeholder={placeholder}
        value={value}
      />
      <DropdownMenu>
        <DropdownMenuTrigger className="ml-3 flex h-full flex-row items-center outline-none">
          {filterLabelContent} <Icon name="ChevronDown" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="rounded-xl border border-gray-100 bg-gray-50 p-2">
          {items.map((item) => (
            <DropdownMenuItem
              className="h-10 cursor-pointer overflow-hidden rounded-lg hover:bg-gray-100"
              id={item.id}
              key={item.id}
              onSelect={() => onFilterSelect(item.id)}
            >
              {item.content}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
