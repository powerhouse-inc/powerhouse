import { z } from "zod";

/**
 * Schema introspection utilities for Zod v4.
 *
 * Uses the public Zod v4 API: .type, .shape, .description, .def,
 * .isOptional(), and instanceof checks.
 */

export interface FieldInfo {
  key: string;
  description: string | undefined;
  isOptional: boolean;
  hasDefault: boolean;
  defaultValue: unknown;
  baseType: string;
  sensitive: boolean;
}

const WRAPPER_TYPES = new Set(["default", "optional", "nullable"]);

/**
 * Extract field entries from a ZodObject schema's shape.
 * Returns an empty array for non-object schemas.
 *
 * When `sensitiveKeys` is provided, those fields are marked `sensitive: true`.
 */
export function getSchemaFields(
  schema: z.ZodType,
  sensitiveKeys?: ReadonlySet<string>,
): FieldInfo[] {
  if (!(schema instanceof z.ZodObject)) {
    return [];
  }

  const fields: FieldInfo[] = [];
  for (const [key, field] of Object.entries(schema.shape) as [
    string,
    z.ZodType,
  ][]) {
    fields.push({
      key,
      description: field.description,
      isOptional: field.isOptional(),
      hasDefault: field instanceof z.ZodDefault,
      defaultValue:
        field instanceof z.ZodDefault ? field.def.defaultValue : undefined,
      baseType: resolveBaseType(field),
      sensitive: sensitiveKeys?.has(key) ?? false,
    });
  }
  return fields;
}

/**
 * Resolve the base type name by unwrapping Default/Optional/Nullable wrappers.
 * Uses .type and .def.innerType (both public Zod v4 API).
 */
function resolveBaseType(schema: z.ZodType): string {
  let current = schema as {
    type: string;
    def: { innerType?: { type: string; def: any } };
  };
  while (WRAPPER_TYPES.has(current.type) && current.def.innerType) {
    current = current.def.innerType as typeof current;
  }
  return current.type;
}

/**
 * Convert a kebab-case slug to a Title Case string.
 * E.g. 'document-modeling' → 'Document Modeling'
 */
export function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
