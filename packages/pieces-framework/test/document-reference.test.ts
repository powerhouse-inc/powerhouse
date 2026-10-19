import { describe, expect, it } from "vitest";
import {
  containsDocumentRef,
  DOCUMENT_REF_KEY,
  documentReference,
  documentRefsIn,
  expandDocumentRefs,
  isDocumentRefMarker,
  isReactorDocument,
  referenceDocuments,
} from "../src/workflow.js";

const header = (id: string) => ({
  id,
  documentType: "acme/invoice",
  branch: "main",
  revision: { global: 3, local: 0 },
  createdAtUtcIso: "2026-01-01T00:00:00.000Z",
  lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  name: "Invoice",
  slug: id,
  sig: { publicKey: {}, nonce: "" },
});

const document = (id: string) => ({
  header: header(id),
  state: {
    global: { total: 10, customer: "Acme" },
    auth: { grants: [{ principal: { address: "0xabc" } }] },
  },
});

const ref = (id: string) => ({
  documentId: id,
  documentType: "acme/invoice",
  branch: "main",
  revision: { global: 3, local: 0 },
});

describe("documentReference", () => {
  it("copies id, type, branch and revision from a header", () => {
    const source = header("doc-1");
    const reference = documentReference(source);
    expect(reference).toEqual(ref("doc-1"));
    source.revision.global = 9;
    expect(reference.revision.global).toBe(3);
  });
});

describe("referenceDocuments", () => {
  it("swaps a document for a marker, keeping the step's own keys", () => {
    const value = referenceDocuments({
      ...document("doc-1"),
      extractedFrom: { documentId: "prose" },
    });
    expect(value).toEqual({
      [DOCUMENT_REF_KEY]: ref("doc-1"),
      extractedFrom: { documentId: "prose" },
    });
    expect(isDocumentRefMarker(value)).toBe(true);
  });

  it("swaps documents at any depth, inside arrays too", () => {
    const value = referenceDocuments({
      results: [document("a"), { header: header("b") }, document("c")],
      nextCursor: "x",
      nested: { deeper: [[document("d")]] },
    });
    expect(value).toEqual({
      results: [
        { [DOCUMENT_REF_KEY]: ref("a") },
        { header: header("b") },
        { [DOCUMENT_REF_KEY]: ref("c") },
      ],
      nextCursor: "x",
      nested: { deeper: [[{ [DOCUMENT_REF_KEY]: ref("d") }]] },
    });
    expect(documentRefsIn(value).map((entry) => entry.documentId)).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("drops a full document's operations and clipboard with it", () => {
    const value = referenceDocuments({
      ...document("doc-1"),
      initialState: {},
      operations: { global: [{ index: 0 }] },
      clipboard: [],
    });
    expect(value).toEqual({ [DOCUMENT_REF_KEY]: ref("doc-1") });
  });

  it("leaves objects that only look partly like documents alone", () => {
    const lookalikes = [
      { header: { id: "x" }, state: {} },
      { header: header("x"), state: "text" },
      { header: { ...header("x"), revision: { global: "3" } }, state: {} },
      { header: { ...header("x"), documentType: "" }, state: {} },
      { header: { "content-type": "text/html" }, state: { ok: true } },
      { headers: header("x"), state: {} },
    ];
    for (const value of lookalikes) {
      expect(isReactorDocument(value)).toBe(false);
      expect(referenceDocuments(value)).toEqual(value);
    }
    expect(containsDocumentRef(referenceDocuments(lookalikes))).toBe(false);
  });

  it("passes scalars, class instances and cycles through", () => {
    expect(referenceDocuments("text")).toBe("text");
    expect(referenceDocuments(null)).toBeNull();
    const date = new Date(0);
    expect(referenceDocuments({ at: date })).toEqual({ at: date });
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic.self = cyclic;
    expect(() => referenceDocuments(cyclic)).not.toThrow();
  });
});

describe("expandDocumentRefs", () => {
  it("replaces each marker with what the reference expands to", () => {
    const journaled = referenceDocuments({
      ...document("doc-1"),
      extractedFrom: { documentId: "prose" },
    });
    const expanded = expandDocumentRefs(journaled, (reference) => ({
      header: { id: reference.documentId },
      state: { global: { total: "Int" } },
    }));
    expect(expanded).toEqual({
      header: { id: "doc-1" },
      state: { global: { total: "Int" } },
      extractedFrom: { documentId: "prose" },
    });
    expect(containsDocumentRef(expanded)).toBe(false);
  });

  it("refuses a marker whose reference is malformed", () => {
    expect(
      isDocumentRefMarker({ [DOCUMENT_REF_KEY]: { documentId: "x" } }),
    ).toBe(false);
    expect(containsDocumentRef({ [DOCUMENT_REF_KEY]: "doc-1" })).toBe(false);
  });
});
