import type {
  DocumentModelGlobalState,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  assertNoReservedOperationNames,
  validateDocumentModelState,
} from "./validation.js";

function specification(
  version: number,
  operationNames: string[],
): DocumentSpecification {
  return {
    version,
    changeLog: [],
    state: {
      global: { schema: "", initialValue: "", examples: [] },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [
      {
        id: "module-1",
        name: "items",
        description: null,
        operations: operationNames.map((name, index) => ({
          id: `operation-${index}`,
          name,
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
        })),
      },
    ],
  };
}

function documentModelState(
  ...specifications: DocumentSpecification[]
): DocumentModelGlobalState {
  return {
    id: "powerhouse/test",
    name: "Test",
    extension: "",
    description: "",
    author: { name: "", website: null },
    specifications,
  };
}

describe("validateDocumentModelState", () => {
  it("accepts a spec without reserved operation names", () => {
    expect(
      validateDocumentModelState(
        documentModelState(specification(1, ["ADD_ITEM"])),
      ),
    ).toEqual({ isValid: true, errors: [] });
  });

  it.each([
    "RETRACT",
    "UNDO",
    "retract",
    "setName",
    "purgeDocument",
    "retract ",
    "set-preferred-editor",
  ])("refuses an operation named %s", (name) => {
    const result = validateDocumentModelState(
      documentModelState(specification(1, ["ADD_ITEM", name])),
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual([
      `Operation "${name}" in module "items" has a reserved name`,
    ]);
  });
});

describe("assertNoReservedOperationNames", () => {
  it("passes a model without reserved operation names", () => {
    expect(() =>
      assertNoReservedOperationNames(
        documentModelState(specification(1, ["ADD_ITEM"])),
      ),
    ).not.toThrow();
  });

  it("refuses a reserved name in any specification", () => {
    expect(() =>
      assertNoReservedOperationNames(
        documentModelState(
          specification(1, ["RETRACT"]),
          specification(2, ["ADD_ITEM"]),
        ),
      ),
    ).toThrow(
      'Cannot generate document model "Test": Operation "RETRACT" in module "items" has a reserved name (specification v1)',
    );
  });
});
