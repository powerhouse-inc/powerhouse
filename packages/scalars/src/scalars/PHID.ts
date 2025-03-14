import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";

export type ScalarType = {
  input: string;
  output: string;
};

export const type = "string";

export const typedef = "scalar PHID";

export const schema = z.string();

export const stringSchema = "z.string()";

const phidlValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<string, string> = {
  name: "PHID",
  description: "A custom scalar that represents a PowerhouseID string",
  serialize: phidlValidation,
  parseValue: phidlValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.STRING) {
      throw new GraphQLError(`Value is not a valid string: ${value.kind}`, {
        nodes: value,
      });
    }

    return phidlValidation(value.value);
  },
};

export const scalar = new GraphQLScalarType(config);
