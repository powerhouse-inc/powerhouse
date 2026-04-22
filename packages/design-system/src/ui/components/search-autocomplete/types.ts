import type { ReactNode } from "react";

export interface SearchAutocompleteOption {
  value: string;
  label: string;
  version?: string;
  description?: string;
  meta?: string;
  disabled?: boolean;
  disabledLabel?: string;
  distTags?: Record<string, string>;
  versions?: string[];
}

export interface SearchAutocompleteRowContext {
  selectingValue: string | null;
  selectLabel: string;
  selectingContent?: ReactNode;
  handleSelect: (value: string) => void;
}

export interface SearchAutocompleteProps {
  fetchOptions?: (query: string) => Promise<SearchAutocompleteOption[]>;
  onSelect: (value: string) => void | Promise<void>;
  selectLabel?: string;
  selectingContent?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  renderOption?: (option: SearchAutocompleteOption) => ReactNode;
  renderRow?: (
    option: SearchAutocompleteOption,
    ctx: SearchAutocompleteRowContext,
  ) => ReactNode;
  keepOpenSelector?: string;
  debounceMs?: number;
}
