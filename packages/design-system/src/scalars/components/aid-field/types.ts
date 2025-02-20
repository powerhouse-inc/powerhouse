import type { AutocompleteProps } from "@/scalars/components/fragments/autocomplete-field/types";

export type AIDProps = Omit<AutocompleteProps, "renderOption"> & {
  supportedNetworks?: string[]; // TODO: add configs
};
