import { zocker } from "zocker";
import type { z } from "zod";

export function generateMock<TSchema extends z.ZodType>(
  schema: TSchema,
  overrides?: Partial<z.infer<TSchema>>,
): z.infer<TSchema> {
  const generated = zocker(schema).generate() as z.infer<TSchema>;
  if (!overrides) return generated;
  return { ...(generated as object), ...overrides } as z.infer<TSchema>;
}
