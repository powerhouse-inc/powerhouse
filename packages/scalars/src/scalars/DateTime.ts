import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type BasePHScalar } from "./types.js";

const type = "string";

const typedef = "scalar DateTime";

const schema = z.string().datetime();

const stringSchema = "z.string().datetime()";

const datetimeValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not iso string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

const config: GraphQLScalarTypeConfig<string, string> = {
  name: "DateTime",
  description: "A custom scalar that represents a datetime in ISO 8601 format",
  serialize: datetimeValidation,
  parseValue: datetimeValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.STRING) {
      throw new GraphQLError("Value is not an string", { nodes: value });
    }

    return datetimeValidation(value.value);
  },
};

const scalar = new GraphQLScalarType(config);

export const DateTimeScalar: BasePHScalar<string> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;
