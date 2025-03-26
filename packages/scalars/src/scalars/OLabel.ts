import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type BasePHScalar } from "./types.js";

const type = "string";

const typedef = "scalar OLabel";

const schema = z.string();

const stringSchema = "z.string()";

const oLabelValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

const config: GraphQLScalarTypeConfig<string, string> = {
  name: "OLabel",
  description: "A custom scalar that represents a OLabel string",
  serialize: oLabelValidation,
  parseValue: oLabelValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.STRING) {
      throw new GraphQLError(`Value is not a valid string: ${value.kind}`, {
        nodes: value,
      });
    }

    return oLabelValidation(value.value);
  },
};

const scalar = new GraphQLScalarType(config);

export const OLabelScalar: BasePHScalar<string> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;
