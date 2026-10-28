import { describe, expect, it } from "vitest";
import { makeSharedSchemaSdl } from "./schema-context.js";

describe("makeSharedSchemaSdl", () => {
  it("accepts a model that declares a standard library scalar itself", () => {
    const sdl = makeSharedSchemaSdl(
      "scalar AttachmentRef\nscalar Date\ntype AgentState { attachment: AttachmentRef, at: Date }",
    );
    expect(sdl).toContain("attachment: AttachmentRef");
    expect(sdl.match(/^scalar AttachmentRef$/gm)).toHaveLength(1);
  });

  it("keeps a model's own custom scalar", () => {
    expect(
      makeSharedSchemaSdl("scalar Iban\ntype PaymentState { iban: Iban }"),
    ).toMatch(/^scalar Iban$/m);
  });
});
