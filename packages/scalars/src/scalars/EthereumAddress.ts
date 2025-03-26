import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
} from "graphql";
import { z } from "zod";
import { type BasePHScalar } from "./types.js";

const type = "string";

const typedef = "scalar EthereumAddress";

const schema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
  message: "Invalid Ethereum address format",
});

const stringSchema =
  "z.string().regex(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid Ethereum address format' })";

const addressValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

const config: GraphQLScalarTypeConfig<string, string> = {
  name: "EthereumAddress",
  description:
    'A custom scalar representing an Ethereum address, validated as a 42-character hexadecimal string prefixed with "0x"',
  serialize: addressValidation,
  parseValue: addressValidation,
  parseLiteral: (value) => {
    if (value.kind !== Kind.STRING) {
      throw new GraphQLError("some error message", { nodes: value });
    }

    return addressValidation(value.value);
  },
};

const scalar = new GraphQLScalarType(config);

export const EthereumAddressScalar: BasePHScalar<string> = {
  type,
  typedef,
  schema,
  stringSchema,
  config,
  scalar,
} as const;
