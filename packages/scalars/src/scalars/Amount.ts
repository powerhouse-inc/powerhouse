import {
  GraphQLError,
  GraphQLScalarType,
  type GraphQLScalarTypeConfig,
  Kind,
  type StringValueNode,
} from "graphql";
import { z } from "zod";

export type Amount = {
  unit?: string;
  value: number;
};

export type ScalarType = {
  input: Amount;
  output: Amount;
};

export const type = "{ unit?: string, value?: number }";

export const typedef = "scalar Amount";

export const schema = z.object({
  unit: z.string().optional(),
  value: z.number().finite(),
});

export const stringSchema =
  "z.object({ unit: z.string().optional(), value: z.number().finite() })";

const amountValidation = (value: unknown): Amount => {
  if (typeof value !== "object" || !value) {
    throw new GraphQLError(`Invalid Amount value: ${JSON.stringify(value)}`);
  }

  const result = schema.safeParse(value);

  if (result.success) return result.data;
  throw new GraphQLError(result.error.message);
};

export const config: GraphQLScalarTypeConfig<Amount, Amount> = {
  name: "Amount",
  description:
    "A custom scalar that represents a currency amount with its currency type",
  serialize: amountValidation,
  parseValue: amountValidation,
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.OBJECT) {
      throw new GraphQLError("Value must be an object", { nodes: ast });
    }

    const unitField = ast.fields.find((f) => f.name.value === "unit");
    const valueField = ast.fields.find((f) => f.name.value === "value");

    if (unitField && unitField.value.kind !== Kind.STRING) {
      throw new GraphQLError("unit must be a valid string value", {
        nodes: ast,
      });
    }

    if (!valueField || valueField.value.kind !== Kind.FLOAT) {
      throw new GraphQLError("value must be a valid float value", {
        nodes: ast,
      });
    }

    const value = {
      unit: (unitField?.value as StringValueNode | undefined)?.value,
      value: parseFloat(valueField.value.value),
    };

    return amountValidation(value);
  },
};

export const scalar = new GraphQLScalarType(config);
