import type {
  IdAutocompleteOption,
  IdAutocompleteProps,
} from "../../../../scalars/components/fragments/id-autocomplete/types.js";
import type { WithDifference } from "../../../../scalars/components/types.js";

export interface PHIDInputWithDifference extends WithDifference<string> {
  basePreviewTitle?: string;
  basePreviewPath?: string;
  basePreviewDescription?: string;
}

type PHIDOption = IdAutocompleteOption;

type PHIDInputBaseProps = Omit<
  IdAutocompleteProps,
  | "autoComplete"
  | "fetchOptionsCallback"
  | "fetchSelectedOptionCallback"
  | "previewPlaceholder"
  | "renderOption"
> &
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

type PHIDInputProps = PHIDInputBaseProps &
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
        ) => Promise<PHIDOption[]> | PHIDOption[];
        fetchSelectedOptionCallback?: (
          value: string,
        ) => Promise<PHIDOption | undefined> | PHIDOption | undefined;
        previewPlaceholder?: PHIDOption;
      }
  ) &
  PHIDInputWithDifference;

export type { PHIDInputProps, PHIDOption };
