import type {
  IdAutocompleteOption,
  IdAutocompleteProps,
} from "../../../../scalars/components/fragments/id-autocomplete/types.js";

type OIDOption = IdAutocompleteOption;

type OIDInputBaseProps = Omit<
  IdAutocompleteProps,
  | "autoComplete"
  | "fetchOptionsCallback"
  | "fetchSelectedOptionCallback"
  | "previewPlaceholder"
  | "renderOption"
>;

type OIDInputProps = OIDInputBaseProps &
  (
    | {
        autoComplete: false;
        fetchOptionsCallback?: never;
        fetchSelectedOptionCallback?: never;
        previewPlaceholder?: never;
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
        previewPlaceholder?: OIDOption;
      }
  );

export type { OIDInputProps, OIDOption };
