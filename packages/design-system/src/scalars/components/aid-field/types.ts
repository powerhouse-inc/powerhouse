import type { IdAutocompleteProps } from "../fragments/id-autocomplete-field/types.js";

export interface Network {
  chainId: string;
  name?: string;
}

export type AIDProps = Omit<IdAutocompleteProps, "renderOption"> & {
  supportedNetworks?: Network[];
};
