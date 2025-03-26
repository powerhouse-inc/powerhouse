import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type BasePHScalar } from "./types.js";

const type = "number";

const typedef = "scalar Amount_Tokens";

const schema = z.number();

const stringSchema = "z.number()";

const amountTokensValidation = (value: unknown): number => {
  if (typeof value !== "number") {
    throw new GraphQLError(`Value is not number: ${JSON.stringify(value)}`);
  }

  if (!Number.isFinite(value)) {
    throw new GraphQLError(`Value is not a finite number: ${value}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

const config: GraphQLScalarTypeConfig<number, number> = {
  name: "Amount_Tokens",
  description: "A custom scalar that represents an amount of tokens",
  serialize: amountTokensValidation,
  parseValue: amountTokensValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.FLOAT) {
      throw new GraphQLError("some error message", { nodes: value });
    }

    const parsedValue = parseFloat(value.value);

    return amountTokensValidation(parsedValue);
  },
};

const scalar = new GraphQLScalarType(config);

export const AmountTokensScalar: BasePHScalar<number> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;
