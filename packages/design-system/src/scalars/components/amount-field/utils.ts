import { currencies } from "@/scalars/lib/currency-list";

// Allows only numbers, optionally including a negative sign at the beginning and a decimal point.
export const getLabelValueCurrenct = (subCurrency: string[]) =>
  subCurrency.map((item) => ({
    value: currencies[item],
    label: currencies[item],
  }));
