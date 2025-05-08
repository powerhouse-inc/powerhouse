import { type GraphQLScalarType, type GraphQLScalarTypeConfig } from "graphql";
import { type z } from "zod";

export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | { [key: string]: Serializable };

export type BasePHScalar<TInput> = {
  type: string;
  typedef: `scalar ${string}`;
  schema: z.ZodType<TInput>;
  stringSchema: string;
  config: GraphQLScalarTypeConfig<TInput, Serializable>;
  scalar: GraphQLScalarType<TInput, Serializable>;
};
