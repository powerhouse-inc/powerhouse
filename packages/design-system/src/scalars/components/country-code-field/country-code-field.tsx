import React from "react";
import { SelectFieldRaw } from "@/scalars/components/fragments/select-field";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import countries from "world-countries";
import { CircleFlag } from "react-circle-flags";
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { CountryCodeProps } from "./types";

export type CountryCodeFieldProps = FieldCommonProps<string> &
  ErrorHandling &
  CountryCodeProps;

const CountryCodeFieldRaw: React.FC<CountryCodeFieldProps> = React.forwardRef<
  HTMLButtonElement,
  CountryCodeFieldProps
>(
  (
    {
      onChange,
      placeholder,
      allowedCountries,
      excludedCountries,
      includeDependentAreas = false,
      viewMode = "NamesOnly",
      showFlagIcons = true,
      enableSearch,
      ...props
    },
    ref,
  ) => {
    const defaultOptions = countries
      .filter(
        (country) =>
          (includeDependentAreas ? true : country.independent) &&
          country.cca2 !== "AQ", // exclude Antarctica
      )
      .map((country) => ({
        value: country.cca2,
        label:
          viewMode === "CodesOnly"
            ? country.cca2
            : viewMode === "NamesAndCodes"
              ? `${country.name.common} (${country.cca2})`
              : country.name.common,
        icon: showFlagIcons
          ? () => (
              <CircleFlag
                className="size-4"
                countryCode={country.cca2.toLowerCase()}
                height={16}
              />
            )
          : undefined,
      }))
      .sort((a, b) => (a.label > b.label ? 1 : a.label < b.label ? -1 : 0));

    const options =
      Array.isArray(allowedCountries) || Array.isArray(excludedCountries)
        ? defaultOptions.filter(
            (option) =>
              (!allowedCountries || allowedCountries.includes(option.value)) &&
              !excludedCountries?.includes(option.value),
          )
        : defaultOptions;

    return (
      <SelectFieldRaw
        ref={ref}
        options={options}
        selectionIcon="checkmark"
        selectionIconPosition="right"
        searchable={enableSearch}
        onChange={onChange}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);

export const CountryCodeField = withFieldValidation<CountryCodeFieldProps>(
  CountryCodeFieldRaw,
  {
    validations: {
      _validOption:
        ({ allowedCountries, excludedCountries, includeDependentAreas }) =>
        (value: string | undefined) => {
          if (value === "" || value === undefined) {
            return true;
          }

          const validCountries = countries
            .filter(
              (country) =>
                (includeDependentAreas ? true : country.independent) &&
                country.cca2 !== "AQ",
            )
            .map((country) => country.cca2);

          // First check if it's a valid country code
          if (!validCountries.includes(value)) {
            return "Please select a valid country";
          }
          // Check if country is in allowed list
          if (
            Array.isArray(allowedCountries) &&
            !allowedCountries.includes(value)
          ) {
            return "Please select a valid country";
          }
          // Check if country is in excluded list
          if (
            Array.isArray(excludedCountries) &&
            excludedCountries.includes(value)
          ) {
            return "Please select a valid country";
          }

          return true;
        },
    },
  },
);

CountryCodeField.displayName = "CountryCodeField";
