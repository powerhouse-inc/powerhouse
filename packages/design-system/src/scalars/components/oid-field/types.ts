import type {
  IdAutocompleteOption,
  IdAutocompleteProps,
} from "../fragments/id-autocomplete-field/types.js";

export type OIDOption = IdAutocompleteOption;

type OIDBaseProps = Omit<
  IdAutocompleteProps,
  | "autoComplete"
  | "fetchOptionsCallback"
  | "fetchSelectedOptionCallback"
  | "renderOption"
>;

export type OIDProps = OIDBaseProps &
  (
    | {
        autoComplete: false;
        fetchOptionsCallback?: never;
        fetchSelectedOptionCallback?: never;
      }
    | {
        autoComplete?: true;
        fetchOptionsCallback: (
          userInput: string,
          context?: Record<string, unknown>,
        ) => Promise<OIDOption[]> | OIDOption[];
        fetchSelectedOptionCallback?: (
          value: string,
        ) => Promise<OIDOption | undefined> | OIDOption | undefined;
      }
  );
