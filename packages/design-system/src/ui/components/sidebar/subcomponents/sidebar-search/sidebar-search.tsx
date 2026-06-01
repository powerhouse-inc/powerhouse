import { useLayoutEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { Input } from "../../../input/input.js";
import CrossCircle from "../../../../../powerhouse/components/icon-components/CrossCircle.js";
import Search from "../../../../../powerhouse/components/icon-components/Search.js";
import Tabler from "../../../../../powerhouse/components/icon-components/Tabler.js";
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
  const [searchControlsPaddingRight, setSearchControlsPaddingRight] =
    useState(16);

  useLayoutEffect(() => {
    if (searchControlsRef.current) {
      setSearchControlsPaddingRight(searchControlsRef.current.clientWidth + 16);
    }
  }, [searchTerm]);

  return (
    <div className="flex w-full gap-2 border-t border-gray-300 p-2 dark:border-slate-800">
      <div className="relative flex-1">
        <Input
          type="search"
          value={searchTerm}
          onChange={(e) => changeSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              nextSearchResult();
            } else if (e.key === "ArrowUp") {
              previousSearchResult();
            }
          }}
          tabIndex={1}
          placeholder="Search"
          className="w-full appearance-none pl-8 [&::-webkit-search-cancel-button]:hidden"
          style={{ paddingRight: searchControlsPaddingRight }}
        />

        <Search
          height={16}
          width={16}
          className="absolute top-1/2 left-2 -translate-y-1/2 text-gray-700 dark:text-slate-50"
        />

        {/* Search controls - only shown when there's a search term */}
        {searchTerm && (
          <div
            ref={searchControlsRef}
            className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-2 select-none"
          >
            <SearchResultCounter
              isSearching={isSearching}
              activeIndex={activeSearchIndex}
              totalResults={searchResults.length}
            />

            <div className="flex flex-col text-gray-500 dark:text-slate-700">
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
              onClick={() => changeSearchTerm("")}
              height={16}
              width={16}
              className="cursor-pointer text-gray-500 hover:text-gray-700 active:text-gray-800 dark:text-slate-700 dark:hover:text-slate-600 dark:active:text-slate-300"
            />
          </div>
        )}
      </div>

      {showStatusFilter && (
        <button
          type="button"
          onClick={toggleStatusFilter}
          tabIndex={1}
          className={twMerge(
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
