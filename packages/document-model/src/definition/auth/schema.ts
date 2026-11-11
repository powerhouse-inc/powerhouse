import { z } from "zod";
import type {
  ScalarDefinition,
  ScalarRepresentation,
} from "../../scalars/types.js";

export type AuthScalarRepresentations = ReadonlyMap<
  z.ZodType,
  ScalarRepresentation | undefined
>;

function unwrap(schema: z.ZodType): z.ZodType {
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodNonOptional
  ) {
    const inner = schema.unwrap();
    if (!(inner instanceof z.ZodType))
      throw new TypeError(
        "An authorization descriptor must use the supported Zod schema runtime.",
      );
    return unwrap(inner);
  }
  if (schema instanceof z.ZodLazy) {
    const inner = schema.unwrap();
    if (!(inner instanceof z.ZodType))
      throw new TypeError(
        "An authorization descriptor must use the supported Zod schema runtime.",
      );
    return unwrap(inner);
  }
  // Conditions inspect recorded values; a pipe's parsed output is not an operand.
  if (schema instanceof z.ZodPipe && schema.in instanceof z.ZodType)
    return unwrap(schema.in);
  return schema;
}
export function fieldSchemas(
  schema: z.ZodType,
): Readonly<Record<string, z.ZodType>> {
  const base = unwrap(schema);
  if (base instanceof z.ZodObject) return base.shape;
  if (base instanceof z.ZodUnion) {
    const options = base.options.filter(
      (option): option is z.ZodType => option instanceof z.ZodType,
    );
    if (options.length === 0) return {};
    const fields = options.map(fieldSchemas);
    return Object.fromEntries(
      Object.keys(fields[0])
        .filter((key) => fields.every((shape) => key in shape))
        .map((key) => [key, z.union(fields.map((shape) => shape[key]))]),
    );
  }
  return {};
}
export function isPrimitiveSchema(
  schema: z.ZodType,
  representations: AuthScalarRepresentations = new Map(),
): boolean {
  const base = unwrap(schema);
  const representation = representations.get(base);
  if (
    representation &&
    !["string", "number", "boolean"].includes(representation)
  )
    return false;
  if (base instanceof z.ZodCustom)
    return ["string", "number", "boolean"].includes(
      representations.get(base) ?? "",
    );
  if (
    base instanceof z.ZodString ||
    base instanceof z.ZodNumber ||
    base instanceof z.ZodBoolean ||
    base instanceof z.ZodNull ||
    base instanceof z.ZodEnum
  )
    return true;
  if (base instanceof z.ZodLiteral)
    return [...base.values].every(
      (value) =>
        value === null ||
        ["string", "number", "boolean"].includes(typeof value),
    );
  if (base instanceof z.ZodUnion)
    return base.options.every(
      (option) =>
        option instanceof z.ZodType &&
        isPrimitiveSchema(option, representations),
    );
  return false;
}

export function acceptsPrimitive(
  schema: z.ZodType,
  kind: string,
  representations: AuthScalarRepresentations = new Map(),
): boolean {
  const base = unwrap(schema);
  if (base instanceof z.ZodUnion)
    return base.options.some(
      (option) =>
        option instanceof z.ZodType &&
        acceptsPrimitive(option, kind, representations),
    );
  if (kind === "null") return schema.safeParse(null).success;
  if (base instanceof z.ZodCustom) return representations.get(base) === kind;
  if (kind === "boolean")
    return (
      base instanceof z.ZodBoolean ||
      (base instanceof z.ZodLiteral &&
        [...base.values].every((value) => typeof value === "boolean"))
    );
  if (kind === "string")
    return (
      base instanceof z.ZodString ||
      base instanceof z.ZodEnum ||
      (base instanceof z.ZodLiteral &&
        [...base.values].every((value) => typeof value === "string"))
    );
  return (
    base instanceof z.ZodNumber ||
    (base instanceof z.ZodLiteral &&
      [...base.values].every((value) => typeof value === "number"))
  );
}

export function requiresPrimitiveRepresentation(
  schema: z.ZodType,
  representations: AuthScalarRepresentations,
): boolean {
  return representations.get(unwrap(schema)) === "json";
}

export function scalarRepresentationsFor(
  definitions: Iterable<ScalarDefinition>,
): AuthScalarRepresentations {
  return new Map(
    [...definitions].map((definition) => [
      unwrap(definition.schema),
      definition.representation,
    ]),
  );
}
