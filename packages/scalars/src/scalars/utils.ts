import { z } from "zod";
import { customScalars } from "./index.js";
import { type Serializable } from "./types.js";

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

export function getPHCustomScalarByTypeName(name: string) {
  const scalar =
    Object.values(customScalars).find(
      (scalar) => scalar.config.name === name,
    ) ?? null;
  return scalar;
}
