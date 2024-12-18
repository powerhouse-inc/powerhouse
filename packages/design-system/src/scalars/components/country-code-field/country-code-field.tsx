import React from "react";
import { SelectFieldRaw } from "@/scalars/components/fragments/select-field";
import { withFieldValidation } from "@/scalars/components/fragments/with-field-validation";
import { countries } from "country-data-list";
import { CircleFlag } from "react-circle-flags";
import { FieldCommonProps, ErrorHandling } from "@/scalars/components/types";
import { CountryCodeProps } from "./types";

export type CountryCodeFieldProps = FieldCommonProps<string> &
  ErrorHandling &
  CountryCodeProps;

const CountryCodeFieldRaw: React.FC<CountryCodeFieldProps> = React.forwardRef<
  HTMLButtonElement | HTMLDivElement,
  CountryCodeFieldProps
>(
  (
    {
      onChange,
      placeholder,
      allowedCountries,
      excludedCountries,
      // TODO: implement dependant areas
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      includeDependentAreas = false,
      viewMode = "NamesOnly",
      showFlagIcons = true,
      enableSearch,
      ...props
    },
    ref,
  ) => {
    const defaultOptions = countries.all
      .filter(
        (country) =>
          country.alpha2 && country.emoji && country.status !== "deleted",
      )
      .map((country) => ({
        value: country.alpha2,
        label:
          viewMode === "CodesOnly"
            ? country.alpha2
            : viewMode === "NamesAndCodes"
              ? `${country.name} (${country.alpha2})`
              : country.name,
        icon: showFlagIcons
          ? () => (
              <CircleFlag
                className="size-4"
                countryCode={country.alpha2.toLowerCase()}
                height={16}
              />
            )
          : undefined,
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
        ref={ref}
        options={options}
        optionsCheckmark="None"
        searchable={enableSearch}
        searchPosition="Input"
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
        ({ allowedCountries, excludedCountries }) =>
        (value: string | undefined) => {
          if (value === "" || value === undefined) {
            return true; // show only the required message
          }

          const validCountries = countries.all
            .filter(
              (country) =>
                country.alpha2 && country.emoji && country.status !== "deleted",
            )
            .map((country) => country.alpha2);

          // First check if it's a valid country code
          if (!validCountries.includes(value)) {
            return "Please select a valid country";
          }
          // Check if country is in allowed list
          if (allowedCountries && !allowedCountries.includes(value)) {
            return "Please select a valid country";
          }
          // Check if country is in excluded list
          if (excludedCountries?.includes(value)) {
            return "Please select a valid country";
          }

          return true;
        },
    },
  },
);

CountryCodeField.displayName = "CountryCodeField";
