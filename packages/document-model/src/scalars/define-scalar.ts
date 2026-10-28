import { z } from "zod";
import { scalarCatalog } from "./catalog.js";
import { defineCatalogScalar } from "./define-catalog-scalar.js";
import type { ScalarDefinition } from "./types.js";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type OutputIsAny = {
  "defineScalar refuses this schema: its output is any": never;
};
type AcceptsMissingValue = {
  "defineScalar refuses this schema: it accepts a missing value; nullability belongs in the SDL": never;
};
type OutputCanBeNull = {
  "defineScalar refuses this schema: its output can be null; nullability belongs in the SDL": never;
};
type OutputIsNotJson = {
  "defineScalar refuses this schema: its output must be JSON": never;
};
type OutputFailsSchema = {
  "defineScalar refuses this schema: its output must pass the schema again": never;
};

// zod marks .default() and .prefault() with optin "defaulted" and .optional()
// and .nullish() with optout "optional". z.coerce and z.preprocess take
// `unknown`, which includes undefined, so for them only the markers count.
type TakesMissingValue<S extends z.ZodType> =
  S["_zod"]["optin"] extends "defaulted"
    ? true
    : S["_zod"]["optout"] extends "optional"
      ? true
      : unknown extends z.input<S>
        ? false
        : undefined extends z.input<S>
          ? true
          : false;

type CanonicalSchema<S extends z.ZodType> = 0 extends 1 & z.output<S>
  ? OutputIsAny
  : TakesMissingValue<S> extends true
    ? AcceptsMissingValue
    : z.output<S> extends Json
      ? null extends z.output<S>
        ? OutputCanBeNull
        : z.output<S> extends z.input<S>
          ? S
          : OutputFailsSchema
      : OutputIsNotJson;

type ScalarInput<TName extends string, S extends z.ZodType> = {
  name: TName;
  schema: S & CanonicalSchema<S>;
  description?: string;
  example?: NoInfer<z.input<S>>;
};

const inputKeys = new Set(["name", "schema", "description", "example"]);
const graphqlBuiltIns: ReadonlySet<unknown> = new Set([
  "Int",
  "Float",
  "String",
  "Boolean",
  "ID",
]);
const catalogNames: ReadonlySet<unknown> = new Set(
  scalarCatalog.map((definition) => definition.name),
);
const graphqlName = /^[_A-Za-z][_0-9A-Za-z]*$/;

type Refusal = (
  input: Readonly<Record<string, unknown>> & { readonly schema: z.ZodType },
) => string | undefined;

const refusals: readonly Refusal[] = [
  (input) => {
    const unknownKeys = Object.keys(input).filter((key) => !inputKeys.has(key));
    return unknownKeys.length > 0
      ? `unknown input key ${unknownKeys.join(", ")}; defineScalar accepts only name, schema, description and example`
      : undefined;
  },
  ({ name }) =>
    typeof name !== "string" || !graphqlName.test(name) || name.startsWith("__")
      ? "the name is not a valid GraphQL name"
      : undefined,
  ({ name }) =>
    graphqlBuiltIns.has(name)
      ? "the name is a GraphQL built-in scalar"
      : undefined,
  ({ name }) =>
    catalogNames.has(name) ? "the name is a catalog scalar" : undefined,
  ({ schema }) =>
    schema._zod.optin === "defaulted" || schema._zod.optout === "optional"
      ? "the schema accepts a missing value; nullability belongs in the SDL"
      : undefined,
];

export function defineScalar<TName extends string, S extends z.ZodType>(
  input: ScalarInput<TName, S>,
): ScalarDefinition<TName, z.output<S>> {
  for (const refusal of refusals) {
    const reason = refusal(input);
    if (reason !== undefined) {
      throw new Error(
        `Cannot define scalar "${String(input.name)}": ${reason}.`,
      );
    }
  }
  const { example, ...definition } = input;
  // TypeScript cannot relate a generic S to its own z.output<S>.
  const schema = input.schema as z.ZodType<z.output<S>>;
  const parsedExample =
    example === undefined ? undefined : schema.safeParse(example);
  if (parsedExample?.success === false) {
    throw new Error(
      `Cannot define scalar "${input.name}": the example fails the schema: ${z.prettifyError(parsedExample.error)}`,
    );
  }
  return defineCatalogScalar({
    ...definition,
    schema,
    ...(parsedExample && { example: parsedExample.data }),
    typescriptType: null,
    zodSource: null,
  });
}
