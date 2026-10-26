import type {
  Operation,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { writeIdentityRows } from "../../../src/executor/util.js";

function entry(
  type: string,
  state: Record<string, unknown>,
  overrides: { scope?: string; deniedReason?: string } = {},
): OperationWithContext {
  const operation = {
    id: `op-${type}`,
    index: 0,
    skip: 0,
    hash: "h",
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    action: {
      id: `a-${type}`,
      type,
      scope: overrides.scope ?? "document",
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
      input: {},
    },
    ...(overrides.deniedReason ? { deniedReason: overrides.deniedReason } : {}),
  } as unknown as Operation;
  return {
    operation,
    context: {
      documentId: "doc-1",
      documentType: "powerhouse/context-type",
      scope: overrides.scope ?? "document",
      branch: "main",
      ordinal: 1,
      resultingState: JSON.stringify(state),
    },
  };
}

const header = {
  slug: "alpha",
  name: "Alpha",
  documentType: "powerhouse/test",
};

describe("writeIdentityRows", () => {
  it("derives a row from a creation's resulting state", () => {
    expect(
      writeIdentityRows([entry("CREATE_DOCUMENT", { header, document: {} })]),
    ).toEqual([
      {
        documentId: "doc-1",
        branch: "main",
        slug: "alpha",
        documentType: "powerhouse/test",
        isDeleted: false,
      },
    ]);
  });

  it("frees the slug of a deleted document", () => {
    expect(
      writeIdentityRows([
        entry("DELETE_DOCUMENT", { header, document: { isDeleted: true } }),
      ]),
    ).toEqual([expect.objectContaining({ slug: null, isDeleted: true })]);
  });

  it("falls back to the context's document type and drops a slug equal to the id", () => {
    expect(
      writeIdentityRows([
        entry("UPGRADE_DOCUMENT", { header: { slug: "doc-1" }, document: {} }),
      ]),
    ).toEqual([
      expect.objectContaining({
        slug: null,
        documentType: "powerhouse/context-type",
      }),
    ]);
  });

  it("skips denied operations, other actions and other scopes", () => {
    expect(
      writeIdentityRows([
        entry(
          "DELETE_DOCUMENT",
          { header, document: { isDeleted: true } },
          { deniedReason: "denied" },
        ),
        entry("ADD_RELATIONSHIP", { header, document: {} }),
        entry("SET_NAME", { header, global: {} }, { scope: "global" }),
      ]),
    ).toEqual([]);
  });
});
