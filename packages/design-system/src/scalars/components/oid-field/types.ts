import type React from "react";
import type {
  IdAutocompleteOption,
  IdAutocompleteProps,
} from "../fragments/id-autocomplete/types.js";
import type { FieldErrorHandling, InputBaseProps } from "../types.js";

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

type OIDInputBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof InputBaseProps<string>
  | keyof FieldErrorHandling
  | keyof OIDProps
  | "pattern"
>;

type OIDInputProps = OIDInputBaseProps &
  InputBaseProps<string> &
  FieldErrorHandling &
  OIDProps;

type OIDFieldBaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  | keyof InputBaseProps<string>
  | keyof FieldErrorHandling
  | keyof OIDProps
  | "pattern"
>;

type OIDFieldProps = OIDFieldBaseProps &
  InputBaseProps<string> &
  FieldErrorHandling &
  OIDProps;

export type { OIDFieldProps, OIDInputProps, OIDOption };
