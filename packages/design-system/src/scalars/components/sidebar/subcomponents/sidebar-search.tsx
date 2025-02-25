"use client";

import { useCallback, useRef } from "react";
import { useSidebar } from "./sidebar-provider";
import { Input } from "../../fragments";
import { cn } from "@/scalars/lib";
import Tabler from "@/assets/icon-components/Tabler";
import CrossCircle from "@/assets/icon-components/CrossCircle";
import Search from "@/assets/icon-components/Search";

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
  const ref = useRef<HTMLDivElement>(null);

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
            paddingRight: (ref.current?.clientWidth ?? 0) + 16,
          }}
        />
        <Search
          height={16}
          width={16}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-700 dark:text-gray-50"
        />
        {searchTerm && (
          <div
            ref={ref}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 select-none items-center gap-2"
          >
            {isSearching ? (
              <div className="h-4 w-6 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-800" />
            ) : (
              <div className="text-xs">
                {searchResults.length > 0 ? (
                  <>
                    <span className="text-gray-700 dark:text-gray-50">
                      {activeSearchIndex + 1}
                    </span>
                    <span className="text-gray-500 dark:text-gray-700">
                      /{searchResults.length}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-700">0/0</span>
                )}
              </div>
            )}

            <div className="flex flex-col text-gray-500 dark:text-gray-700">
              <div
                className={cn(
                  "cursor-pointer px-1 py-0.5 hover:text-gray-700 dark:hover:text-gray-300",
                  activeSearchIndex === 0 &&
                    "cursor-not-allowed text-gray-200 dark:text-gray-900",
                )}
                onClick={previousSearchResult}
              >
                <svg
                  width="8"
                  height="6"
                  viewBox="0 0 8 6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* eslint-disable-next-line react/jsx-max-depth */}
                  <path
                    d="M0.266663 5.6001H7.73333L4 0.800097L0.266663 5.6001Z"
                    fill="currentcolor"
                  />
                </svg>
              </div>

              <div
                className={cn(
                  "cursor-pointer px-1 py-0.5 hover:text-gray-700 dark:hover:text-gray-300",
                  activeSearchIndex === searchResults.length - 1 &&
                    "cursor-not-allowed text-gray-200 dark:text-gray-900",
                )}
                onClick={nextSearchResult}
              >
                <svg
                  width="8"
                  height="6"
                  viewBox="0 0 8 6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* eslint-disable-next-line react/jsx-max-depth */}
                  <path
                    d="M0.266663 0.399902H7.73333L4 5.1999L0.266663 0.399902Z"
                    fill="currentcolor"
                  />
                </svg>
              </div>
            </div>

            <CrossCircle
              onClick={handleReset}
              name="CrossCircle"
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
