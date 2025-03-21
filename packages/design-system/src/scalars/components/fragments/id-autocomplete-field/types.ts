import type { IconName } from "#powerhouse";

interface IdAutocompleteBaseProps {
  onChange?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export type IdAutocompleteProps = IdAutocompleteBaseProps &
  (
    | {
        autoComplete: false;
        variant?: never;
        isOpenByDefault?: never;
        initialOptions?: never;
        fetchOptionsCallback?: never;
        fetchSelectedOptionCallback?: never;
        renderOption?: never;
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
      }
  );

interface IdAutocompleteBaseOption {
  icon?: IconName | React.ReactElement;
  title?: string;
  path?: {
    text: string;
    url?: string;
  };
  value: string;
  description?: string;
}

export type IdAutocompleteOption<
  T extends Record<string, unknown> = Record<never, unknown>,
> = IdAutocompleteBaseOption & T;
