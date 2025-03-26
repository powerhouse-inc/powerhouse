import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type BasePHScalar } from "./types.js";

const type = "string";

const typedef = "scalar OID";

const schema = z.string();

const stringSchema = "z.string()";

const oIdValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

const config: GraphQLScalarTypeConfig<string, string> = {
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

const scalar = new GraphQLScalarType(config);

export const OIDScalar: BasePHScalar<string> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;
