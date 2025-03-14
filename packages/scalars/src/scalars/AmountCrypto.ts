import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";

export type SupportedCrypto = "DAI" | "ETH" | "MKR" | "SKY" | "USDC" | "USDS";

export type AmountCrypto = {
  unit: SupportedCrypto;
  value: number;
};

export type ScalarType = {
  input: AmountCrypto;
  output: AmountCrypto;
};

export const type =
  "{ unit: 'DAI' | 'ETH' | 'MKR' | 'SKY' | 'USDC' | 'USDS', value: number }";

export const typedef = "scalar Amount_Crypto";

export const schema = z.object({
  unit: z.enum([
    "DAI",
    "ETH",
    "MKR",
    "SKY",
    "USDC",
    "USDS",
  ] as const satisfies readonly SupportedCrypto[]),
  value: z.number().finite(),
});

export const stringSchema =
  "z.object({ unit: z.enum(['DAI', 'ETH', 'MKR', 'SKY', 'USDC', 'USDS']), value: z.number().finite() })";

const amountCryptoValidation = (value: unknown): AmountCrypto => {
  if (typeof value !== "object" || !value) {
    throw new GraphQLError(
      `Invalid Amount Crypto value: ${JSON.stringify(value)}`,
    );
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<AmountCrypto, AmountCrypto> = {
  name: "Amount_Crypto",
  description:
    "A custom scalar that represents a cryptocurrency amount with its currency type",
  serialize: amountCryptoValidation,
  parseValue: amountCryptoValidation,
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
      unit: unitField.value.value as SupportedCrypto,
      value: parseFloat(valueField.value.value),
    };

    return amountCryptoValidation(value);
  },
};

export const scalar = new GraphQLScalarType(config);
