import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type SupportedCrypto } from "./AmountCrypto.js";
import { type SupportedFiat } from "./AmountFiat.js";

export type SupportedCurrency = SupportedFiat | SupportedCrypto;

export type AmountCurrency = {
  unit: SupportedCurrency;
  value: number;
};

export type ScalarType = {
  input: AmountCurrency;
  output: AmountCurrency;
};

export const type =
  "{ unit: 'DAI' | 'ETH' | 'MKR' | 'SKY' | 'USDC' | 'USDS' | 'USD' | 'EUR' | 'GBP', value: number }";

export const typedef = "scalar Amount_Currency";

export const schema = z.object({
  unit: z.enum([
    "DAI",
    "ETH",
    "MKR",
    "SKY",
    "USDC",
    "USDS",
    "USD",
    "EUR",
    "GBP",
  ] as const satisfies readonly SupportedCurrency[]),
  value: z.number().finite(),
});

export const stringSchema =
  "z.object({ unit: z.enum(['DAI', 'ETH', 'MKR', 'SKY', 'USDC', 'USDS', 'USD', 'EUR', 'GBP']), value: z.number().finite() })";

const amountCurrencyValidation = (value: unknown): AmountCurrency => {
  if (typeof value !== "object" || !value) {
    throw new GraphQLError(
      `Invalid Amount Currency value: ${JSON.stringify(value)}`,
    );
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<AmountCurrency, AmountCurrency> = {
  name: "Amount_Currency",
  description:
    "A custom scalar that represents a currency amount with its currency type",
  serialize: amountCurrencyValidation,
  parseValue: amountCurrencyValidation,
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.OBJECT) {
      throw new GraphQLError("Value must be an object", { nodes: ast });
    }

    const unitField = ast.fields.find((f) => f.name.value === "unit");
    const valueField = ast.fields.find((f) => f.name.value === "value");

    if (!unitField || unitField.value.kind !== Kind.ENUM) {
      throw new GraphQLError("unit must be a valid enum value", {
        nodes: ast,
      });
    }

    if (!valueField || valueField.value.kind !== Kind.FLOAT) {
      throw new GraphQLError("value must be a valid float value", {
        nodes: ast,
      });
    }

    const value = {
      unit: unitField.value.value as SupportedCurrency,
      value: parseFloat(valueField.value.value),
    };

    return amountCurrencyValidation(value);
  },
};

export const scalar = new GraphQLScalarType(config);
