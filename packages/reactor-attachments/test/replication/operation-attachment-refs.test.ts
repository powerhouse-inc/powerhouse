import type {
  AttachmentRef,
  IDocumentModelRegistry,
} from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { AttachmentSchemaCompiler } from "../../src/reference-index/attachment-schema-compiler.js";
import { SchemaCompiledOperationRefs } from "../../src/replication/operation-attachment-refs.js";

const REF_A = `attachment://v1:${"a".repeat(64)}` as AttachmentRef;
const REF_B = `attachment://v1:${"b".repeat(64)}` as AttachmentRef;
const DOCUMENT_TYPE = "example/attachment-document";

function module(): DocumentModelModule {
  return {
    actions: {},
    documentModel: {
      global: {
        id: DOCUMENT_TYPE,
        specifications: [
          {
            changeLog: [],
            modules: [
              {
                description: null,
                id: "module-1",
                name: "attachments",
                operations: [
                  {
                    description: null,
                    errors: [],
                    examples: [],
                    id: "operation-attachFile",
                    name: "attachFile",
                    reducer: null,
                    schema:
                      "input AttachFileInput { ref: AttachmentRef, extras: [AttachmentRef!] }",
                    scope: "global",
                    template: null,
                  },
                ],
              },
            ],
            state: {
              global: { examples: [], initialValue: "{}", schema: "" },
              local: { examples: [], initialValue: "{}", schema: "" },
            },
            version: 1,
          },
        ],
      },
    },
    version: 1,
  } as unknown as DocumentModelModule;
}

function registry(result: () => DocumentModelModule): IDocumentModelRegistry {
  return { getModule: result } as unknown as IDocumentModelRegistry;
}

function item(
  input: unknown,
  overrides: Partial<{ error: string; actionType: string }> = {},
): OperationWithContext {
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      timestampUtcMs: "0",
      hash: "",
      ...(overrides.error !== undefined ? { error: overrides.error } : {}),
      action: {
        id: "action-1",
        type: overrides.actionType ?? "ATTACH_FILE",
        input,
        scope: "global",
        timestampUtcMs: "0",
      },
    },
    context: {
      documentId: "document-1",
      documentType: DOCUMENT_TYPE,
      scope: "global",
      branch: "main",
      ordinal: 1,
    },
  } as unknown as OperationWithContext;
}

describe("SchemaCompiledOperationRefs", () => {
  it("extracts declared AttachmentRef fields through the shared compiler", () => {
    const refs = new SchemaCompiledOperationRefs(
      registry(module),
      new AttachmentSchemaCompiler(),
    );
    expect(refs.refsOf(item({ ref: REF_A, extras: [REF_B] }))).toEqual([
      REF_A,
      REF_B,
    ]);
  });

  it("returns nothing for an action the model does not declare", () => {
    const refs = new SchemaCompiledOperationRefs(
      registry(module),
      new AttachmentSchemaCompiler(),
    );
    expect(
      refs.refsOf(item({ ref: REF_A }, { actionType: "SET_NAME" })),
    ).toEqual([]);
  });

  it("skips an operation that recorded an error", () => {
    const refs = new SchemaCompiledOperationRefs(
      registry(module),
      new AttachmentSchemaCompiler(),
    );
    expect(refs.refsOf(item({ ref: REF_A }, { error: "rejected" }))).toEqual(
      [],
    );
  });

  it("reports and swallows an extraction failure rather than failing the bus", () => {
    const diagnostics: string[] = [];
    const refs = new SchemaCompiledOperationRefs(
      registry(module),
      new AttachmentSchemaCompiler(),
      (message) => diagnostics.push(message),
    );
    // A malformed ref in a declared AttachmentRef field is what the read model
    // refuses loudly; the replicator must not turn that into a write failure.
    expect(refs.refsOf(item({ ref: "not-a-ref" }))).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain("ATTACH_FILE");
  });

  it("reports an unresolved model action instead of silently dropping its refs", () => {
    const diagnostics: { message: string; error: unknown }[] = [];
    const refs = new SchemaCompiledOperationRefs(
      registry(module),
      new AttachmentSchemaCompiler(),
      (message, error) => diagnostics.push({ message, error }),
    );
    expect(
      refs.refsOf(item({ ref: REF_A }, { actionType: "UNKNOWN_ACTION" })),
    ).toEqual([]);
    expect(diagnostics).toEqual([
      {
        message:
          "extracting attachment refs from example/attachment-document/UNKNOWN_ACTION failed",
        error: new Error(
          'Attachment schema compilation failed for document type "example/attachment-document", version 1, action "UNKNOWN_ACTION": no operation maps to the action',
        ),
      },
    ]);
  });

  it("logs an unresolved model action when no diagnostic callback is supplied", () => {
    const messages: unknown[] = [];
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation((message) => {
        messages.push(message);
      });
    try {
      const refs = new SchemaCompiledOperationRefs(
        registry(module),
        new AttachmentSchemaCompiler(),
      );
      expect(
        refs.refsOf(item({ ref: REF_A }, { actionType: "UNKNOWN_ACTION" })),
      ).toEqual([]);
      expect(messages).toEqual([
        expect.stringContaining(
          'Attachment schema compilation failed for document type "example/attachment-document", version 1, action "UNKNOWN_ACTION": no operation maps to the action',
        ),
      ]);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("reports and swallows an unregistered document type", () => {
    const diagnostics: string[] = [];
    const refs = new SchemaCompiledOperationRefs(
      registry(() => {
        throw new Error("no such module");
      }),
      new AttachmentSchemaCompiler(),
      (message) => diagnostics.push(message),
    );
    expect(refs.refsOf(item({ ref: REF_A }))).toEqual([]);
    expect(diagnostics).toHaveLength(1);
  });
});
