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

export const typedef = "scalar EthereumAddress";

export const schema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
  message: "Invalid Ethereum address format",
});

export const stringSchema =
  "z.string().regex(/^0x[a-fA-F0-9]{40}$/, { message: 'Invalid Ethereum address format' })";

const addressValidation = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new GraphQLError(`Value is not string: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<string, string> = {
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

export const scalar = new GraphQLScalarType(config);
