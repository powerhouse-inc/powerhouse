import type { IconName } from "@/powerhouse/components/icon";

export interface AutocompleteBaseProps {
  onChange?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export type AutocompleteProps = AutocompleteBaseProps &
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
        initialOptions?: AutocompleteOption[];
        fetchOptionsCallback: (
          userInput: string,
        ) => Promise<AutocompleteOption[]>;
        fetchSelectedOptionCallback?: (
          value: string,
        ) => Promise<AutocompleteOption | undefined>;
        renderOption?: (
          option: AutocompleteOption,
          displayProps?: {
            asPlaceholder?: boolean;
            showValue?: boolean;
            isLoadingSelectedOption?: boolean;
            handleFetchSelectedOption?: (value: string) => void;
            className?: string;
          },
        ) => React.ReactNode;
      }
  );

export interface AutocompleteOption {
  icon?: IconName | React.ReactElement;
  title?: string;
  path?: string;
  value: string;
  description?: string;
}
