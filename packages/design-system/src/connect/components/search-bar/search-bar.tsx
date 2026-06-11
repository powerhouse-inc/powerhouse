import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from "#design-system";
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
      <div className="mr-2 text-sm font-semibold text-gray-200 dark:text-slate-700">
        {filterLabel}
      </div>
    )
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event.target.value);
  }

  return (
    <div className={twMerge("flex items-center", className)}>
      <Icon className="mr-3 text-gray-700 dark:text-slate-200" name="Search" />
      <input
        className={twMerge(
          "flex h-[52px] min-w-0 flex-1 items-center rounded-xl border border-gray-300 bg-gray-50 px-4 text-sm text-gray-200 outline-none dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
        )}
        onChange={handleChange}
        placeholder={placeholder}
        value={value}
      />
      <DropdownMenu>
        <DropdownMenuTrigger className="ml-3 flex h-full flex-row items-center outline-none">
          {filterLabelContent} <Icon name="ChevronDown" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="rounded-xl border border-gray-300 bg-gray-50 p-2 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100">
          {items.map((item) => (
            <DropdownMenuItem
              className="h-10 cursor-pointer overflow-hidden rounded-lg hover:effect"
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
