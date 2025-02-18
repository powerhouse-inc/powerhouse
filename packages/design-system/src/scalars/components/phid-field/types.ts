import type { AutocompleteProps } from "@/scalars/components/fragments/autocomplete-field/types";

export type PHIDProps = Omit<AutocompleteProps, "renderOption"> & {
  allowedScopes?: string[];
  allowUris?: boolean;
};
