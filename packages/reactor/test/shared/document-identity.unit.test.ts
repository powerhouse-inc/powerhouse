import { describe, expect, it } from "vitest";
import {
  identityFromDocumentState,
  isDeletedDocumentState,
  resolvableSlug,
} from "../../src/shared/document-identity.js";

describe("identityFromDocumentState", () => {
  it("reads slug, name and documentType from the header", () => {
    const identity = identityFromDocumentState({
      header: {
        slug: "my-doc",
        name: "My Doc",
        documentType: "powerhouse/test",
      },
      global: {},
    });

    expect(identity).toEqual({
      slug: "my-doc",
      name: "My Doc",
      documentType: "powerhouse/test",
    });
  });

  it("defaults to null without a header or a previous identity", () => {
    expect(identityFromDocumentState({ global: {} })).toEqual({
      slug: null,
      name: null,
    });
  });

  it("keeps previous values where the header field is not a string", () => {
    const identity = identityFromDocumentState(
      { header: { slug: 42, name: null } },
      { slug: "old-slug", name: "Old Name" },
    );

    expect(identity).toEqual({ slug: "old-slug", name: "Old Name" });
  });

  it("takes an empty string from the header", () => {
    const identity = identityFromDocumentState(
      { header: { slug: "", name: "" } },
      { slug: "old-slug", name: "Old Name" },
    );

    expect(identity).toEqual({ slug: "", name: "" });
  });

  it("keeps the previous name when told to preserve it", () => {
    const identity = identityFromDocumentState(
      { header: { slug: "new-slug", name: "Stale Echo" } },
      { slug: "old-slug", name: "Current Name" },
      { preserveName: true },
    );

    expect(identity).toEqual({ slug: "new-slug", name: "Current Name" });
  });

  it("ignores a header that is not an object", () => {
    expect(
      identityFromDocumentState(
        { header: "nonsense" },
        { slug: "s", name: "n" },
      ),
    ).toEqual({ slug: "s", name: "n" });
  });
});

describe("resolvableSlug", () => {
  it("is the slug when it differs from the document id", () => {
    expect(resolvableSlug("my-doc", "doc-1")).toBe("my-doc");
  });

  it("is null for a slug equal to the document id", () => {
    expect(resolvableSlug("doc-1", "doc-1")).toBeNull();
  });

  it("is null for an empty or missing slug", () => {
    expect(resolvableSlug("", "doc-1")).toBeNull();
    expect(resolvableSlug(null, "doc-1")).toBeNull();
  });
});

describe("isDeletedDocumentState", () => {
  it("is true when the document scope says so", () => {
    expect(
      isDeletedDocumentState({ document: { isDeleted: true, version: 1 } }),
    ).toBe(true);
  });

  it("is false for a live document or a state without a document scope", () => {
    expect(isDeletedDocumentState({ document: { version: 1 } })).toBe(false);
    expect(isDeletedDocumentState({ document: { isDeleted: "yes" } })).toBe(
      false,
    );
    expect(isDeletedDocumentState({ global: {} })).toBe(false);
  });
});
