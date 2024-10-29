import { z } from "zod";
import validator from "validator";
import { snakeCase, constantCase } from "change-case";
import { EmptyStringSchema } from "./utils";

const whitespaceRegex = /\s+/g;

export function containsSpaces(s: string) {
  return whitespaceRegex.test(s);
}

export function replaceSpaces(s: string) {
  return s.replace(whitespaceRegex, "_");
}

export const NoWhitespaceSchema = z
  .string()
  .min(1)
  .refine((s) => !containsSpaces(s), {
    message: "Cannot contain spaces",
  });

export const ConstantCaseSchema = z.string().refine(validator.isUppercase, {
  message: "Must be uppercase",
});

export const LowercaseSnakeCaseSchema = z
  .string()
  .refine(validator.isLowercase, {
    message: "Must be lowercase",
  });

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

export const ToLowercaseSnakeCaseSchema = z
  .string()
  .toLowerCase()
  .transform(replaceSpaces);

export const ToConstantCaseSchema = z
  .string()
  .toUpperCase()
  .transform(replaceSpaces);

export function toLowercaseSnakeCase(value: string) {
  return ToLowercaseSnakeCaseSchema.parse(
    snakeCase(value),
  ) as LowercaseSnakeCase;
}

export function toConstantCase(value: string) {
  return ToConstantCaseSchema.parse(constantCase(value)) as ConstantCase;
}

export type SnakeCase = `${string}_${string}`;
export type LowercaseSnakeCase = Lowercase<SnakeCase>;
export type ConstantCase = Uppercase<SnakeCase>;
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export const AuthorSchema = z
  .object({
    name: EmptyStringSchema,
    website: z
      .union([z.string().url(), z.literal("")])
      .optional()
      .default(""),
  })
  .default({
    name: "",
    website: "",
  });
