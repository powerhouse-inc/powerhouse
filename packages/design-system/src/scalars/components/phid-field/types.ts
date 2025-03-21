import type { IdAutocompleteProps } from "../fragments/id-autocomplete-field/types.js";

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
