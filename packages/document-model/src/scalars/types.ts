import type { z } from "zod";
import type { ScalarLiteralNode } from "./scalar-literal.js";

export const SCALAR_DEFINITION = Symbol.for("powerhouse.scalar-definition");
export const SCALAR_DEFINITION_VERSION = 1;

/** The wire shape of a scalar's values. */
export type ScalarRepresentation =
  | "string"
  | "number"
  | "boolean"
  | "json-object"
  | "json"
  | "opaque";

/** The GraphQL coercion of a scalar: variables, inline literals, and output. */
export type ScalarCoercion<TValue> = {
  readonly parseValue: (input: unknown) => TValue;
  readonly parseLiteral: (node: ScalarLiteralNode) => TValue;
  readonly serialize: (value: unknown) => unknown;
};

export type ScalarDefinition<
  TName extends string = string,
  TValue = unknown,
> = {
  readonly [SCALAR_DEFINITION]: typeof SCALAR_DEFINITION_VERSION;
  readonly name: TName;
  readonly description?: string;
  readonly schema: z.ZodType<TValue>;
  readonly typescriptType: string | null;
  readonly zodSource: string | null;
  readonly example?: TValue;
  /**
   * The wire shape of a value. It picks the literal kinds a derived coercion
   * accepts. A definition from a release before this field lacks it.
   */
  readonly representation?: ScalarRepresentation;
  /** Absent means derived: `schema` runs on every path and only the literal kinds of `representation` parse. */
  readonly coercion?: ScalarCoercion<TValue>;
};

/** A definition this release made, with its representation filled. */
export type DescribedScalarDefinition<
  TName extends string = string,
  TValue = unknown,
> = ScalarDefinition<TName, TValue> & {
  readonly representation: ScalarRepresentation;
};

export type ScalarValue<T> =
  T extends ScalarDefinition<string, infer V> ? V : never;

/** The definition format version `value` is branded with, if it has a brand. */
export function scalarDefinitionVersion(value: unknown): unknown {
  return typeof value === "object" &&
    value !== null &&
    SCALAR_DEFINITION in value
    ? value[SCALAR_DEFINITION]
    : undefined;
}

export function isScalarDefinition(value: unknown): value is ScalarDefinition {
  return scalarDefinitionVersion(value) === SCALAR_DEFINITION_VERSION;
}
