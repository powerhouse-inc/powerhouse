// Regression guard for `generateMock` and the `z.custom(...)` scalars.
//
// Codegen emits `AttachmentRef` and `Address` as `z.custom(...)` (see
// `scalarsValidation` in packages/codegen/src/codegen/graphql.ts). zocker cannot
// synthesise a value satisfying an arbitrary predicate, so it throws for those
// fields. `generateMock`'s `overrides` argument is the escape hatch — but it
// only works if the overridden fields are skipped BEFORE generation. Generating
// first and merging afterwards (the original implementation) threw before the
// caller's value was ever applied, which made every generated test for a model
// with an `AttachmentRef` field fail on its first run.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateMock } from "./mock.js";

// Mirrors what codegen emits for the AttachmentRef scalar.
const attachmentRefSchema = () =>
  z.custom<`attachment://v${number}:${string}`>((val) =>
    /^attachment:\/\/v\d+:.+$/.test(val as string),
  );

const VALID_REF = `attachment://v1:${"a".repeat(64)}` as const;

describe("generateMock", () => {
  it("uses an override for a field zocker cannot generate", () => {
    const schema = z.object({
      sourcePdf: attachmentRefSchema(),
      uploadedAt: z.iso.datetime(),
    });

    const input = generateMock(schema, {
      sourcePdf: VALID_REF,
      uploadedAt: "2024-01-01T00:00:00.000Z",
    });

    expect(input.sourcePdf).toBe(VALID_REF);
    expect(schema.safeParse(input).success).toBe(true);
  });

  it("still generates the fields that were not overridden", () => {
    const schema = z.object({
      sourcePdf: attachmentRefSchema(),
      name: z.string(),
      count: z.number(),
    });

    const input = generateMock(schema, { sourcePdf: VALID_REF });

    expect(input.sourcePdf).toBe(VALID_REF);
    expect(typeof input.name).toBe("string");
    expect(typeof input.count).toBe("number");
  });

  it("overrides win over generated values", () => {
    const schema = z.object({ name: z.string(), count: z.number() });

    const input = generateMock(schema, { name: "pinned" });

    expect(input.name).toBe("pinned");
    expect(typeof input.count).toBe("number");
  });

  it("generates without overrides", () => {
    const schema = z.object({ name: z.string() });

    expect(typeof generateMock(schema).name).toBe("string");
  });

  it("passes through an override for a key that is not in the shape", () => {
    const schema = z.object({ name: z.string() });

    const input = generateMock(schema, { extra: "kept" } as never) as Record<
      string,
      unknown
    >;

    expect(input.extra).toBe("kept");
    expect(typeof input.name).toBe("string");
  });

  it("applies overrides to a non-object schema without throwing", () => {
    const schema = z.record(z.string(), z.string());

    const input = generateMock(schema, { pinned: "value" });

    expect(input.pinned).toBe("value");
  });

  // Documents the intentional boundary: an override is the ONLY way to supply a
  // `z.custom(...)` field. There is no value to invent for an arbitrary
  // predicate, so this must keep failing loudly rather than guessing — which is
  // why codegen carries a literal for every such scalar in SCALAR_MOCK_OVERRIDES.
  it("throws for a z.custom field with no override", () => {
    const schema = z.object({ sourcePdf: attachmentRefSchema() });

    expect(() => generateMock(schema)).toThrow(/No generator for schema custom/);
  });
});
