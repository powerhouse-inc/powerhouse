import type { ReactNode } from "react";

export interface SearchAutocompleteOption {
  value: string;
  label: string;
  description?: string;
  meta?: string;
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
  debounceMs?: number;
}
