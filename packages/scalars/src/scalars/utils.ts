import { type Serializable } from "./types.js";
import { z } from "zod";

export const SerializableSchema: z.ZodType<Serializable> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(SerializableSchema),
    z.record(z.string(), SerializableSchema),
  ]),
);

export function isSerializable(value: unknown): value is Serializable {
  const result = SerializableSchema.safeParse(value);
  return result.success;
}
