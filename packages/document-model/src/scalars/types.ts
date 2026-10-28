import type { z } from "zod";

export const SCALAR_DEFINITION = Symbol.for("powerhouse.scalar-definition");
export const SCALAR_DEFINITION_VERSION = 1;

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
