import { Icon } from "@/index";
import { Input } from "../../fragments";
import { useCallback, useRef } from "react";
import { useSidebar } from "./sidebar-provider";
import { cn } from "@/scalars/lib/utils";

export const SidebarSearch = () => {
  const {
    changeSearchTerm,
    searchTerm,
    searchLoading,
    searchResults,
    activeSearchIndex,
    nextSearchResult,
    previousSearchResult,
  } = useSidebar();
  const ref = useRef<HTMLDivElement>(null);

  const handleReset = useCallback(() => {
    changeSearchTerm("");
  }, [changeSearchTerm]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        nextSearchResult();
      } else if (e.key === "ArrowUp") {
        previousSearchResult();
      }
    },
    [nextSearchResult, previousSearchResult],
  );

  return (
    <div className="w-full border-t border-gray-300 p-2">
      <div className="relative">
        <Input
          value={searchTerm}
          onChange={(e) => changeSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search"
          className="w-full pl-8"
          style={{
            paddingRight: (ref.current?.clientWidth ?? 0) + 16,
          }}
        />
        <Icon
          name="Search"
          size={16}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-700"
        />
        {searchTerm && (
          <div
            ref={ref}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 select-none items-center gap-2"
          >
            {searchLoading ? (
              <div className="h-4 w-6 animate-pulse rounded-sm bg-gray-200" />
            ) : (
              <div className="text-xs">
                {searchResults.length > 0 ? (
                  <>
                    <span className="text-gray-700">
                      {activeSearchIndex + 1}
                    </span>
                    <span className="text-gray-500">
                      /{searchResults.length}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-500">0/0</span>
                )}
              </div>
            )}

            <div className="flex flex-col text-gray-500">
              <div
                className={cn(
                  "cursor-pointer px-1 py-0.5 hover:text-gray-700",
                  activeSearchIndex === 0 && "cursor-not-allowed text-gray-200",
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
                  "cursor-pointer px-1 py-0.5 hover:text-gray-700",
                  activeSearchIndex === searchResults.length - 1 &&
                    "cursor-not-allowed text-gray-200",
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

            <Icon
              onClick={handleReset}
              name="CrossCircle"
              size={16}
              className="cursor-pointer text-gray-500 hover:text-gray-700 active:text-gray-900"
            />
          </div>
        )}
      </div>
    </div>
  );
};
