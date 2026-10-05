import {
  addModule,
  addOperation,
  setModelId,
  setStateSchema,
} from "@powerhousedao/shared/document-model";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
  inspectableDefinition,
} from "document-model";
import { describe, expect, it } from "vitest";

/**
 * A schema-first model document stays editable, and is never mistaken for a
 * compiled definition.
 *
 * The two look superficially alike — both describe a model, and a document can
 * be made to declare the same model id as a registered code-first module — but
 * only one of them is a document with a history that actions write to. Mixing
 * them up in either direction breaks something: reading the document as a
 * compiled definition would show a view with no source, and reading the
 * compiled module as a document would offer an edit that silently does
 * nothing.
 */

const CODE_FIRST_ID = "test/ledger";

function edited(): PHDocument {
  const reducer = documentModelDocumentModelModule.reducer;
  let document = documentModelCreateDocument();
  // The same model id a registered code-first module declares.
  document = reducer(document, setModelId({ id: CODE_FIRST_ID }));
  document = reducer(
    document,
    setStateSchema({
      scope: "global",
      schema: "type LedgerState {\n  total: Int!\n}",
    }),
  );
  document = reducer(
    document,
    addModule({ id: "module-1", name: "entries", description: "" }),
  );
  document = reducer(
    document,
    addOperation({
      id: "operation-1",
      moduleId: "module-1",
      name: "ADD_AMOUNT",
      schema: "input AddAmountInput {\n  amount: Int!\n}",
    }),
  );
  return document;
}

describe("the schema-first model document", () => {
  it("accepts a schema edit and an operation edit as before", () => {
    const document = edited();
    const failures = [
      ...document.operations.global,
      ...document.operations.local,
    ].filter((operation) => operation.error !== undefined);
    expect(failures).toEqual([]);

    const global = (document.state as unknown as { global: unknown })
      .global as {
      id: string;
      specifications: {
        state: { global: { schema: string } };
        modules: { operations: { name: string | null }[] }[];
      }[];
    };
    expect(global.id).toBe(CODE_FIRST_ID);
    const specification = global.specifications.at(-1)!;
    expect(specification.state.global.schema).toContain("type LedgerState");
    expect(
      specification.modules.flatMap((module) =>
        module.operations.map((operation) => operation.name),
      ),
    ).toEqual(["ADD_AMOUNT"]);
  });

  it("is not a compiled definition, whatever model id it declares", () => {
    expect(inspectableDefinition(edited())).toBeNull();
    // Nor is the module that serves it: the document-model model is itself
    // schema-first, so nothing about this pair is inspectable as code-first.
    expect(inspectableDefinition(documentModelDocumentModelModule)).toBeNull();
  });
});
