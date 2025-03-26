import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type BasePHScalar } from "./types.js";

export type SupportedCrypto = string;

export type AmountCrypto = {
  unit: SupportedCrypto;
  value: number;
};

const type = "{ unit: string, value: number }";

const typedef = "scalar Amount_Crypto";

const schema = z.object({
  unit: z.string(),
  value: z.number().finite(),
});

const stringSchema =
  "z.object({ unit: z.string(), value: z.number().finite() })";

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

const config: GraphQLScalarTypeConfig<AmountCrypto, AmountCrypto> = {
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

    if (!unitField || unitField.value.kind !== Kind.STRING) {
      throw new GraphQLError("unit must be a valid string value", {
        nodes: ast,
      });
    }

    if (!valueField || valueField.value.kind !== Kind.FLOAT) {
      throw new GraphQLError("value must be a valid float value", {
        nodes: ast,
      });
    }

    const value = {
      unit: unitField.value.value,
      value: parseFloat(valueField.value.value),
    };

    return amountCryptoValidation(value);
  },
};

const scalar = new GraphQLScalarType(config);

export const AmountCryptoScalar: BasePHScalar<AmountCrypto> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;
