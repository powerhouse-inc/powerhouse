export type * from "./components/types.js";
export type * from "./lib/types.js";
export type ErrorMessage = string;

export type ValidatorResult = ErrorMessage | boolean;

export type ValidatorHandler = (
  value: any,
  formState: Record<string, any>,
) => ValidatorResult | Promise<ValidatorResult>;

export type ViewMode = "edition" | "addition" | "removal" | "mixed";
export type DiffMode = "words" | "sentences";

export interface WithDifference<T> {
  viewMode?: ViewMode;
  diffMode?: DiffMode;
  baseValue?: T;
}

export interface InputBaseProps<T> {
  id?: string;
  name?: string;
  label?: React.ReactNode;
  description?: string;
  value?: T;
  defaultValue?: T;
  required?: boolean;
  disabled?: boolean;
  errors?: ErrorMessage[];
  warnings?: ErrorMessage[];
  className?: string;
}

export interface FieldErrorHandling {
  showErrorOnBlur?: boolean;
  showErrorOnChange?: boolean;
  validators?: ValidatorHandler[] | ValidatorHandler;
}

import type { IconName } from "@powerhousedao/design-system";

export interface Currency {
  ticker: string;
  crypto: boolean;
  label?: string;
  symbol?: string;
  icon?: IconName | React.ComponentType<{ className?: string }>;
}

export type Amount = {
  amount?: number;
  unit?: CurrencyTicker;
};
export type AmountPercentage = number | undefined;
export type CurrencyTicker = Currency["ticker"];

export interface AmountFiat {
  amount?: number;
  unit: CurrencyTicker;
}

export interface AmountCrypto {
  amount?: bigint;
  unit: CurrencyTicker;
}

export interface AmountCurrency {
  amount?: number | bigint;
  unit: CurrencyTicker;
}

export type AmountInputPropsGeneric =
  | {
      type: "Amount";
      value?: Amount;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountFiat";
      value?: AmountFiat;
      trailingZeros?: boolean;
    }
  | {
      type: "AmountPercentage";
      value?: AmountPercentage;
      trailingZeros?: boolean;
      units?: never;
    }
  | {
      type: "AmountCrypto";
      value?: AmountCrypto;
      trailingZeros?: never;
    }
  | {
      type: "AmountCurrency";
      value?: AmountCurrency;
      trailingZeros?: boolean;
    };

export type AmountValue =
  | Amount
  | AmountPercentage
  | AmountFiat
  | AmountCrypto
  | AmountCurrency;
