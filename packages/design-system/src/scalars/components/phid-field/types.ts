import type { IdAutocompleteProps } from "../fragments/id-autocomplete/types.js";

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
