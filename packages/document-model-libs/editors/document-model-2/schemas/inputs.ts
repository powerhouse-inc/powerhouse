import { z } from "zod";
import validator from "validator";
import { containsSpaces, replaceSpaces } from "../lib/utils";
import { GraphQLType, isType } from "graphql";

export function UniqueNameSchema(names: string[]) {
  return z
    .string()
    .min(1)
    .refine((value) => {
      return !names
        .map((n) => n.toLowerCase())
        .includes(value.replace(/^\s+|\s+$/g, "_").toLowerCase());
    }, "Name must be unique");
}

export const OperationTypeSchema = z.union([
  z.literal("SET"),
  z.literal("CREATE"),
  z.literal("UPDATE"),
  z.literal("DELETE"),
]);

export const ScopeSchema = z.union([z.literal("global"), z.literal("local")]);

export const ToLowercaseSnakeCaseSchema = z
  .string()
  .toLowerCase()
  .transform(replaceSpaces);

export const ToConstantCaseSchema = z
  .string()
  .toUpperCase()
  .transform(replaceSpaces);

export const NoWhitespaceSchema = z.string().refine((s) => !containsSpaces(s), {
  message: "Cannot contain spaces",
});

export const ConstantCaseSchema = NoWhitespaceSchema.refine(
  validator.isUppercase,
  {
    message: "Must be uppercase",
  },
);

export const LowercaseSnakeCaseSchema = NoWhitespaceSchema.refine(
  validator.isLowercase,
  {
    message: "Must be lowercase",
  },
);

export const OperationSchema = z.object({
  id: z.string(),
  scope: ScopeSchema,
  name: ConstantCaseSchema,
});

export const GraphQLTypeSchema = z
  .any()
  .refine((val): val is GraphQLType => isType(val), {
    message: "Invalid GraphQL type",
  });

export const ModuleSchema = z.object({
  id: z.string(),
  name: LowercaseSnakeCaseSchema,
  stateFieldName: z.string(),
  stateFieldType: GraphQLTypeSchema,
  operations: z.array(OperationSchema),
});
