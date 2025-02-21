import type { IdAutocompleteProps } from "@/scalars/components/fragments/id-autocomplete-field/types";

export type PHIDProps = Omit<IdAutocompleteProps, "renderOption"> & {
  allowedScopes?: string[];
  allowUris?: boolean;
};
