"use client";

import { useCallback, useRef } from "react";
import CrossCircle from "../../../../../powerhouse/components/icon-components/CrossCircle.js";
import Search from "../../../../../powerhouse/components/icon-components/Search.js";
import Tabler from "../../../../../powerhouse/components/icon-components/Tabler.js";
import { cn } from "../../../../../scalars/lib/utils.js";
import { Input } from "../../../../../ui/components/data-entry/index.js";
import { useSidebar } from "../sidebar-provider/index.js";
import { SearchNavigationArrow } from "./search-navigation-arrow.js";
import { SearchResultCounter } from "./search-result-counter.js";

interface SidebarSearchProps {
  showStatusFilter: boolean;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({
  showStatusFilter,
}) => {
  const {
    searchTerm,
    isSearching,
    searchResults,
    activeSearchIndex,
    isStatusFilterEnabled,
    changeSearchTerm,
    nextSearchResult,
    previousSearchResult,
    toggleStatusFilter,
  } = useSidebar();
  const searchControlsRef = useRef<HTMLDivElement>(null);

  // Event handlers
  const handleReset = useCallback(() => {
    changeSearchTerm("");
  }, [changeSearchTerm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        nextSearchResult();
      } else if (e.key === "ArrowUp") {
        previousSearchResult();
      }
    },
    [nextSearchResult, previousSearchResult],
  );

  const handleSearchTermChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      changeSearchTerm(e.target.value);
    },
    [changeSearchTerm],
  );

  return (
    <div className="flex w-full gap-2 border-t border-gray-300 p-2 dark:border-gray-800">
      <div className="relative flex-1">
        <Input
          type="search"
          value={searchTerm}
          onChange={handleSearchTermChange}
          onKeyDown={handleKeyDown}
          tabIndex={1}
          placeholder="Search"
          className="w-full appearance-none !pl-8 [&::-webkit-search-cancel-button]:hidden"
          style={{
            paddingRight: (searchControlsRef.current?.clientWidth ?? 0) + 16,
          }}
        />

        <Search
          height={16}
          width={16}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-700 dark:text-gray-50"
        />

        {/* Search controls - only shown when there's a search term */}
        {searchTerm && (
          <div
            ref={searchControlsRef}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 select-none items-center gap-2"
          >
            <SearchResultCounter
              isSearching={isSearching}
              activeIndex={activeSearchIndex}
              totalResults={searchResults.length}
            />

            <div className="flex flex-col text-gray-500 dark:text-gray-700">
              <SearchNavigationArrow
                direction="up"
                isDisabled={activeSearchIndex === 0}
                onClick={previousSearchResult}
              />
              <SearchNavigationArrow
                direction="down"
                isDisabled={activeSearchIndex === searchResults.length - 1}
                onClick={nextSearchResult}
              />
            </div>

            {/* Clear search button */}
            <CrossCircle
              onClick={handleReset}
              height={16}
              width={16}
              className="cursor-pointer text-gray-500 hover:text-gray-700 active:text-gray-900 dark:text-gray-700 dark:hover:text-gray-600 dark:active:text-gray-300"
            />
          </div>
        )}
      </div>

      {showStatusFilter && (
        <button
          type="button"
          onClick={toggleStatusFilter}
          tabIndex={1}
          className={cn(
            "rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-500",
            isStatusFilterEnabled
              ? "border-blue-500 bg-blue-100 text-blue-900"
              : "hover:bg-gray-100 hover:text-gray-700",
          )}
        >
          <Tabler height={16} width={16} />
        </button>
      )}
    </div>
  );
};
