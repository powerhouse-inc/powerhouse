import type { IdAutocompleteProps } from "@/scalars/components/fragments/id-autocomplete-field/types";

export type PHIDProps = Omit<IdAutocompleteProps, "renderOption"> &
  (
    | {
        allowUris: true;
        allowedScopes?: string[];
      }
    | {
        allowUris?: false;
        allowedScopes?: never;
      }
  );
