import type {
  IdAutocompleteOption,
  IdAutocompleteProps,
} from "@/scalars/components/fragments/id-autocomplete-field/types";

export interface Network {
  chainId: string;
  name?: string;
}

type AIDOptionProps = {
  agentType?: string;
};
export type AIDOption = IdAutocompleteOption<AIDOptionProps>;

type AIDBaseProps = Omit<
  IdAutocompleteProps,
  | "autoComplete"
  | "fetchOptionsCallback"
  | "fetchSelectedOptionCallback"
  | "renderOption"
> & {
  supportedNetworks?: Network[];
};

export type AIDProps = AIDBaseProps &
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
        ) => Promise<AIDOption[]> | AIDOption[];
        fetchSelectedOptionCallback?: (
          value: string,
        ) => Promise<AIDOption | undefined> | AIDOption | undefined;
      }
  );
