import type { z } from "zod";
import { zocker } from "zocker";

export function generateMock<TSchema extends z.ZodType>(
  schema: TSchema,
): z.infer<TSchema> {
  return zocker(schema).generate() as z.infer<TSchema>;
}
