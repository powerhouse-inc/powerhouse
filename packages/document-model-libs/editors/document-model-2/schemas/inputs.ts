import { z } from "zod";
import validator from "validator";
import { snakeCase, constantCase } from "change-case";

const whitespaceRegex = /\s+/g;

export function containsSpaces(s: string) {
  return whitespaceRegex.test(s);
}

export function replaceSpaces(s: string) {
  return s.replace(whitespaceRegex, "_");
}

type SchemaOptions = {
  required?: boolean;
  allowEmpty?: boolean;
  unique?: string[];
};

export function createNameSchema(options: SchemaOptions = {}) {
  const { required = false, allowEmpty = false, unique = [] } = options;

  const baseSchema = allowEmpty ? z.string() : z.string().min(1);

  const uniqueRefinement = baseSchema.refine(
    (value) => {
      if (!value && allowEmpty) return true;
      return !unique
        .map((n) => n.toLowerCase())
        .includes(value.replace(/^\s+|\s+$/g, "_").toLowerCase());
    },
    { message: "Item with this name already exists" },
  );

  if (!required) {
    return unique.length > 0
      ? z
          .string()
          .optional()
          .refine(
            (value) => {
              if (value === undefined) return true;
              if (!value && allowEmpty) return true;
              return !unique
                .map((n) => n.toLowerCase())
                .includes(value.replace(/^\s+|\s+$/g, "_").toLowerCase());
            },
            { message: "Item with this name already exists" },
          )
      : z.string().optional();
  }

  return unique.length > 0 ? uniqueRefinement : baseSchema;
}

export function createConstantCaseSchema(options: SchemaOptions = {}) {
  return createNameSchema(options)
    .transform((value) => (value ? value.toUpperCase() : value))
    .refine((value) => !value || validator.isUppercase(value), {
      message: "Must be uppercase",
    });
}

export function createLowercaseSnakeCaseSchema(options: SchemaOptions = {}) {
  return createNameSchema(options)
    .transform((value) => (value ? value.toLowerCase() : value))
    .refine((value) => !value || validator.isLowercase(value), {
      message: "Must be lowercase",
    });
}

export function toLowercaseSnakeCase(
  value: string,
  options: SchemaOptions = {},
) {
  return createLowercaseSnakeCaseSchema(options).parse(
    snakeCase(value),
  ) as LowercaseSnakeCase;
}

export function toConstantCase(value: string, options: SchemaOptions = {}) {
  return createConstantCaseSchema(options).parse(
    constantCase(value),
  ) as ConstantCase;
}

export type SnakeCase = `${string}_${string}`;
export type LowercaseSnakeCase = Lowercase<SnakeCase>;
export type ConstantCase = Uppercase<SnakeCase>;
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export const AuthorSchema = z
  .object({
    name: createNameSchema({ allowEmpty: true }),
    website: z
      .union([z.string().url(), z.literal("")])
      .optional()
      .default(""),
  })
  .default({
    name: "",
    website: "",
  });
