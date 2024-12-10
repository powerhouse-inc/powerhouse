import React from "react";
import { SelectFieldRaw } from "@/scalars/components/fragments/select-field";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { countries } from "country-data-list";
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { CountryCodeProps } from "./types";

export type CountryCodeFieldProps = FieldCommonProps<string> &
  ErrorHandling &
  CountryCodeProps;

const CountryCodeFieldRaw: React.FC<CountryCodeFieldProps> = ({
  onChange,
  placeholder,
  allowedCountries,
  excludedCountries,
  includeDependentAreas = false,
  viewMode = "NamesOnly",
  showFlagIcons = true,
  enableSearch,
  ...props
}) => {
  const defaultOptions = countries.all
    .filter(
      (country) =>
        country.alpha2 && country.emoji && country.status !== "deleted",
    )
    .map((country) => ({
      value: country.alpha2,
      label: country.name,
    }))
    .sort((a, b) => (a.label > b.label ? 1 : a.label < b.label ? -1 : 0));

  const options =
    allowedCountries || excludedCountries
      ? defaultOptions.filter(
          (option) =>
            (!allowedCountries || allowedCountries.includes(option.value)) &&
            !excludedCountries?.includes(option.value),
        )
      : defaultOptions;

  return (
    <SelectFieldRaw
      options={options}
      optionsCheckmark="None"
      searchable={enableSearch}
      searchPosition="Input"
      onChange={onChange}
      placeholder={placeholder}
      {...props}
    />
  );
};

export const CountryCodeField =
  withFieldValidation<CountryCodeFieldProps>(CountryCodeFieldRaw);

CountryCodeField.displayName = "CountryCodeField";
