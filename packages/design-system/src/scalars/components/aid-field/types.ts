import type { IdAutocompleteProps } from "@/scalars/components/fragments/id-autocomplete-field/types";

export interface Network {
  chainId: string;
  name?: string;
}

export type AIDProps = Omit<IdAutocompleteProps, "renderOption"> & {
  supportedNetworks?: Network[];
};
