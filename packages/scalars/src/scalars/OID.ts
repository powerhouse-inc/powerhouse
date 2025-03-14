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

export const typedef = "scalar OID";

export const schema = z.string();

export const stringSchema = "z.string()";

const oIdValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<string, string> = {
  name: "OID",
  description: "A custom scalar that represents a OID string",
  serialize: oIdValidation,
  parseValue: oIdValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.STRING) {
      throw new GraphQLError(`Value is not a valid string: ${value.kind}`, {
        nodes: value,
      });
    }

    return oIdValidation(value.value);
  },
};

export const scalar = new GraphQLScalarType(config);
