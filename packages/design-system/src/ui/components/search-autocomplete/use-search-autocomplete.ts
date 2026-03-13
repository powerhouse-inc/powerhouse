import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchAutocompleteOption } from "./types.js";

interface UseSearchAutocompleteOptions {
  fetchOptions?: (query: string) => Promise<SearchAutocompleteOption[]>;
  debounceMs: number;
}

export function useSearchAutocomplete(options: UseSearchAutocompleteOptions) {
  const { fetchOptions, debounceMs } = options;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchAutocompleteOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);

  const fetchResults = useCallback(
    async (searchQuery: string) => {
      if (!fetchOptions) return;

      if (!searchQuery.trim()) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(undefined);

      try {
        const data = await fetchOptions(searchQuery);
        if (!controller.signal.aborted) {
          setResults(data);
          setIsOpen(data.length > 0);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch results",
          );
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [fetchOptions],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!value.trim()) {
        setResults([]);
        setIsOpen(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      debounceRef.current = setTimeout(() => {
        fetchResults(value);
      }, debounceMs);
    },
    [debounceMs, fetchResults],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    isOpen,
    setIsOpen,
    handleQueryChange,
  };
}
