import { zocker } from "zocker";
import { z } from "zod";

/**
 * Narrows to an object schema whose shape we can omit keys from. Callers may
 * pass any `ZodType`, so this has to be checked rather than assumed.
 */
function isObjectSchema(schema: z.ZodType): schema is z.ZodObject {
  return schema instanceof z.ZodObject;
}

/**
 * Builds a mock value for a schema, with `overrides` taking precedence.
 *
 * Overridden fields are removed from the schema *before* generation rather than
 * being overwritten afterwards. That ordering is what makes overrides usable as
 * an escape hatch: some scalars compile to `z.custom(...)` (`AttachmentRef`,
 * `Address`), and zocker cannot synthesise a value satisfying an arbitrary
 * predicate — it throws. Generating first meant the throw happened before the
 * caller's value was ever applied, so an override could not rescue the field it
 * was written for.
 *
 * Only the overridden keys are skipped. A `z.custom(...)` field with no
 * override still throws, which is correct: there is no way to invent a value
 * for it, and the caller needs to say what it should be.
 */
export function generateMock<TSchema extends z.ZodType>(
  schema: TSchema,
  overrides?: Partial<z.infer<TSchema>>,
): z.infer<TSchema> {
  if (!overrides) return zocker(schema).generate() as z.infer<TSchema>;

  const overriddenKeys = Object.keys(overrides);
  if (overriddenKeys.length === 0 || !isObjectSchema(schema)) {
    // Nothing to skip, or a schema with no shape to omit from: generate the
    // whole value and let the overrides win by merge, as before.
    const generated = zocker(schema).generate() as z.infer<TSchema>;
    return { ...(generated as object), ...overrides } as z.infer<TSchema>;
  }

  // Omitting a key the shape does not have is an error in zod, and an override
  // for an unknown key should still pass through to the result.
  const omittable = overriddenKeys.filter((key) => key in schema.shape);
  // `omit` is typed against the shape's literal keys; ours are only known at
  // runtime, so the mask has to be asserted into that parameter type.
  const mask = Object.fromEntries(
    omittable.map((key) => [key, true]),
  ) as Parameters<typeof schema.omit>[0];
  const schemaToGenerate = omittable.length ? schema.omit(mask) : schema;

  const generated = zocker(schemaToGenerate).generate() as object;
  return { ...generated, ...overrides } as z.infer<TSchema>;
}
