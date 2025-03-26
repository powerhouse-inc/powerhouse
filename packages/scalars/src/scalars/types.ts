import { type GraphQLScalarType, type GraphQLScalarTypeConfig } from "graphql";
import { type z } from "zod";

type Serializable =
  | string
  | number
  | boolean
  | null
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
