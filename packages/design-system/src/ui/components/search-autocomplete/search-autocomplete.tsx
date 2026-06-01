import { twMerge } from "tailwind-merge";
import React, { useCallback, useState } from "react";
import { Input } from "../input/input.js";
import { Popover, PopoverAnchor, PopoverContent } from "../popover/popover.js";
import type { SearchAutocompleteProps } from "./types.js";
import { useSearchAutocomplete } from "./use-search-autocomplete.js";

export const SearchAutocomplete: React.FC<SearchAutocompleteProps> = (
  props,
) => {
  const {
    fetchOptions,
    onSelect,
    selectLabel = "Select",
    selectingContent,
    placeholder = "Search...",
    disabled = false,
    loading: externalLoading = false,
    className,
    renderOption,
    renderRow,
    keepOpenSelector,
    debounceMs = 300,
  } = props;

  const {
    query,
    setQuery,
    results,
    isLoading,
    error,
    isOpen,
    setIsOpen,
    handleQueryChange,
  } = useSearchAutocomplete({ fetchOptions, debounceMs });

  const [selectingValue, setSelectingValue] = useState<string | null>(null);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleQueryChange(e.target.value);
    },
    [handleQueryChange],
  );

  const handleSelect = useCallback(
    async (value: string) => {
      setSelectingValue(value);
      try {
        await onSelect(value);
        setQuery("");
        setIsOpen(false);
      } catch {
        // error handled by caller
      } finally {
        setSelectingValue(null);
      }
    },
    [onSelect, setQuery, setIsOpen],
  );

  const handleSubmit = useCallback(() => {
    if (query.trim()) {
      void handleSelect(query.trim());
    }
  }, [query, handleSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!fetchOptions && query.trim()) {
          handleSubmit();
        }
      }
    },
    [fetchOptions, query, handleSubmit],
  );

  const loading = isLoading || externalLoading;

  // Fallback: plain text input + submit when no fetchOptions
  if (!fetchOptions) {
    return (
      <div className={twMerge("flex items-center gap-2", className)}>
        <Input
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || selectingValue !== null}
          className="max-w-xs text-gray-700 dark:text-slate-200"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !query.trim() || selectingValue !== null}
          className="h-9 rounded-md bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-100"
        >
          {selectLabel}
        </button>
      </div>
    );
  }

  return (
    <div className={twMerge("relative", className)}>
      <Popover open={isOpen && results.length > 0} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <Input
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="max-w-xs text-gray-700 dark:text-slate-200"
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (keepOpenSelector) {
              const target = e.target as HTMLElement | null;
              if (target?.closest(keepOpenSelector)) {
                e.preventDefault();
                return;
              }
            }
            setIsOpen(false);
          }}
          className="max-h-80 overflow-visible p-1"
        >
          <div className="max-h-80 overflow-y-auto">
            {results.map((option) => {
              if (renderRow) {
                return (
                  <div key={option.value} className="rounded-md">
                    {renderRow(option, {
                      selectingValue,
                      selectLabel,
                      selectingContent,
                      handleSelect: (value) => void handleSelect(value),
                    })}
                  </div>
                );
              }
              return (
                <div
                  key={option.value}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-700"
                >
                  {renderOption ? (
                    <div className="min-w-0 flex-1">{renderOption(option)}</div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-50">
                        {option.label}
                      </p>
                      {option.version && (
                        <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                          v{option.version}
                        </p>
                      )}
                      {option.description && (
                        <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                          {option.description}
                        </p>
                      )}
                      {option.meta && (
                        <p className="truncate text-xs text-gray-400 dark:text-slate-500">
                          {option.meta}
                        </p>
                      )}
                    </div>
                  )}
                  {selectingValue === option.value && selectingContent ? (
                    <div className="flex shrink-0 items-center justify-center">
                      {selectingContent}
                    </div>
                  ) : option.disabled ? (
                    <span className="shrink-0 rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-slate-700 dark:text-slate-400">
                      {option.disabledLabel ?? "Unavailable"}
                    </span>
                  ) : (
                    <button
                      onClick={() => void handleSelect(option.value)}
                      disabled={selectingValue === option.value}
                      className="shrink-0 rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-100"
                    >
                      {selectingValue === option.value ? "..." : selectLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {loading && (
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
          Searching...
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-100">{error}</p>
      )}
      {!loading &&
        !error &&
        query.trim() &&
        results.length === 0 &&
        !isOpen && (
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            No results found
          </p>
        )}
    </div>
  );
};
