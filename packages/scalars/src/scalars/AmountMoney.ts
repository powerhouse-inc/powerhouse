import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";

export type ScalarType = {
  input: number; // Update this accordingly
  output: number; // Update this accordingly
};

export const type = "number"; // TS type in string form, update this accordingly

export const typedef = "scalar Amount_Money";

export const schema = z.number(); // Update this code accordingly

export const stringSchema = "z.number()"; // Update this code accordingly

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

export const config: GraphQLScalarTypeConfig<number, number> = {
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

export const scalar = new GraphQLScalarType(config);
