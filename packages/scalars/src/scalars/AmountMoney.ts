import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type BasePHScalar } from "./types.js";

const type = "number"; // TS type in string form, update this accordingly

const typedef = "scalar Amount_Money";

const schema = z.number(); // Update this code accordingly

const stringSchema = "z.number()"; // Update this code accordingly

const amountMoneyValidation = (value: unknown): number => {
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
  name: "Amount_Money",
  description:
    "A custom scalar that represents a monetary amount in a currency",
  serialize: amountMoneyValidation,
  parseValue: amountMoneyValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.FLOAT) {
      throw new GraphQLError("Value is not a float type", {
        nodes: value,
      });
    }

    const parsedValue = parseFloat(value.value);

    return amountMoneyValidation(parsedValue);
  },
};

const scalar = new GraphQLScalarType(config);

export const AmountMoneyScalar: BasePHScalar<number> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;
