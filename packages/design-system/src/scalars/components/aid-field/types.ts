import type { AutocompleteProps } from "@/scalars/components/fragments/autocomplete-field/types";

export interface Network {
  chainId: string;
  name?: string;
}

export type AIDProps = Omit<AutocompleteProps, "renderOption"> & {
  supportedNetworks?: Network[];
};
