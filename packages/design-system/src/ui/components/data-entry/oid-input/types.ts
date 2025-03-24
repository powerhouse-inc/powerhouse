import type React from "react";
import type {
  IdAutocompleteOption,
  IdAutocompleteProps,
} from "../../../../scalars/components/fragments/id-autocomplete/types.js";
import type { InputBaseProps } from "../../../../scalars/components/types.js";

type OIDOption = IdAutocompleteOption;

type OIDBaseProps = Omit<
  IdAutocompleteProps,
  | "autoComplete"
  | "fetchOptionsCallback"
  | "fetchSelectedOptionCallback"
  | "renderOption"
>;

type OIDProps = OIDBaseProps &
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

type OIDInputBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  keyof InputBaseProps<string> | keyof OIDProps | "pattern"
>;

type OIDInputProps = OIDInputBaseProps & InputBaseProps<string> & OIDProps;

export type { OIDInputProps, OIDOption };
