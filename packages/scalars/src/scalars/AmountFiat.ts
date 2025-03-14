import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";

export type SupportedFiat = "USD" | "EUR" | "GBP";

export type AmountFiat = {
  unit: SupportedFiat;
  value: number;
};

export type ScalarType = {
  input: AmountFiat;
  output: AmountFiat;
};

export const type = "{ unit: 'USD' | 'EUR' | 'GBP', value: number }";

export const typedef = "scalar Amount_Fiat";

export const schema = z.object({
  unit: z.enum([
    "USD",
    "EUR",
    "GBP",
  ] as const satisfies readonly SupportedFiat[]),
  value: z.number().finite(),
});

export const stringSchema =
  "z.object({ unit: z.enum(['USD', 'EUR', 'GBP']), value: z.number().finite() })";

const amountFiatValidation = (value: unknown): AmountFiat => {
  if (typeof value !== "object" || !value) {
    throw new GraphQLError(
      `Invalid Amount Fiat value: ${JSON.stringify(value)}`,
    );
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<AmountFiat, AmountFiat> = {
  name: "Amount_Fiat",
  description:
    "A custom scalar that represents a currency amount with its currency type",
  serialize: amountFiatValidation,
  parseValue: amountFiatValidation,
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
      unit: unitField.value.value as SupportedFiat,
      value: parseFloat(valueField.value.value),
    };

    return amountFiatValidation(value);
  },
};

export const scalar = new GraphQLScalarType(config);
