import type { IconName } from "#powerhouse";
import type React from "react";
import type { InputBaseProps } from "../../types.js";

interface IdAutocompleteBaseConfigProps {
  onChange?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

type IdAutocompleteConfigProps = IdAutocompleteBaseConfigProps &
  (
    | {
        autoComplete: false;
        variant?: never;
        isOpenByDefault?: never;
        initialOptions?: never;
        fetchOptionsCallback?: never;
        fetchSelectedOptionCallback?: never;
        renderOption?: never;
        previewPlaceholder?: never;
      }
    | {
        autoComplete?: true;
        variant?:
          | "withValue"
          | "withValueAndTitle"
          | "withValueTitleAndDescription";
        isOpenByDefault?: boolean;
        initialOptions?: IdAutocompleteOption[];
        fetchOptionsCallback: (
          userInput: string,
          context?: Record<string, unknown>,
        ) => Promise<IdAutocompleteOption[]> | IdAutocompleteOption[];
        fetchSelectedOptionCallback?: (
          value: string,
        ) =>
          | Promise<IdAutocompleteOption | undefined>
          | IdAutocompleteOption
          | undefined;
        renderOption?: (
          option: IdAutocompleteOption,
          displayProps?: {
            asPlaceholder?: boolean;
            showValue?: boolean;
            isLoadingSelectedOption?: boolean;
            handleFetchSelectedOption?: (value: string) => void;
            isFetchSelectedOptionSync?: boolean;
            className?: string;
          },
        ) => React.ReactNode;
        previewPlaceholder?: IdAutocompleteOption;
      }
  );

type IdAutocompleteProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  keyof InputBaseProps<string> | keyof IdAutocompleteConfigProps | "pattern"
> &
  InputBaseProps<string> &
  IdAutocompleteConfigProps;

interface IdAutocompleteBaseOption {
  icon?: IconName | React.ReactElement;
  title?: string;
  path?:
    | string
    | {
        text: string;
        url: string;
      };
  value: string;
  description?: string;
}

type IdAutocompleteOption<
  T extends Record<string, unknown> = Record<never, unknown>,
> = IdAutocompleteBaseOption & T;

export type { IdAutocompleteOption, IdAutocompleteProps };
