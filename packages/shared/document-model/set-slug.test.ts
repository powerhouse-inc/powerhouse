import { describe, expect, it } from "vitest";
import { setSlug } from "./actions.js";
import { isDocumentAction } from "./documents.js";
import { setSlugOperation } from "./operations.js";
import { DocumentActionSchema } from "./schemas.js";
import type { PHDocument } from "./documents.js";

describe("SET_SLUG", () => {
  it("is a header action of the base reducer, so every document model has it", () => {
    const action = setSlug("mail");

    expect(action).toMatchObject({
      type: "SET_SLUG",
      input: { slug: "mail" },
      scope: "header",
    });
    expect(isDocumentAction(action)).toBe(true);
    expect(DocumentActionSchema().safeParse(action).success).toBe(true);
  });

  it("changes the slug and nothing else", () => {
    const document = {
      header: { id: "id", slug: "id", name: "Mail", meta: { a: 1 } },
      state: { global: {} },
    } as unknown as PHDocument;

    const named = setSlugOperation(document, { slug: "mail" });

    expect(named.header).toEqual({ ...document.header, slug: "mail" });
    expect(named.state).toBe(document.state);
    expect(document.header.slug).toBe("id");
  });

  it("refuses an empty slug", () => {
    expect(() => setSlug("")).toThrow();
  });
});
