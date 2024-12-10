export interface CountryCodeProps {
  onChange?: (value: string | string[]) => void;
  placeholder?: string;
  allowedCountries?: string[];
  excludedCountries?: string[];
  includeDependentAreas?: boolean;
  viewMode?: "CodesOnly" | "NamesOnly" | "NamesAndCodes";
  showFlagIcons?: boolean;
  enableSearch?: boolean;
}
