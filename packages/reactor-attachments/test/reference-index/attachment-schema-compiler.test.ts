import type {
  Action,
  DocumentModelModule,
  DocumentSpecification,
  OperationSpecification,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { AttachmentSchemaCompiler } from "../../index.js";

const REF_A = `attachment://v1:${"a".repeat(64)}` as const;
const REF_B = `attachment://v1:${"b".repeat(64)}` as const;
const REF_C = `attachment://v2:${"c".repeat(64)}` as const;

function operation(
  name: string | null,
  schema: string | null,
): OperationSpecification {
  return {
    description: null,
    errors: [],
    examples: [],
    id: `operation-${name ?? "unnamed"}`,
    name,
    reducer: null,
    schema,
    scope: "global",
    template: null,
  };
}

function specification(
  version: number,
  operations: OperationSpecification[],
): DocumentSpecification {
  return {
    changeLog: [],
    modules: [
      {
        description: null,
        id: `module-${version}`,
        name: "attachments",
        operations,
      },
    ],
    state: {
      global: { examples: [], initialValue: "{}", schema: "" },
      local: { examples: [], initialValue: "{}", schema: "" },
    },
    version,
  };
}

function documentModule(
  specifications: DocumentSpecification[],
  version = 1,
  documentType = "example/attachment-document",
): DocumentModelModule {
  return {
    actions: {},
    documentModel: {
      global: {
        id: documentType,
        specifications,
      },
    },
    version,
  } as unknown as DocumentModelModule;
}

function action(type: string, input: unknown): Action {
  return {
    id: "action-id",
    input,
    scope: "global",
    timestampUtcMs: "2026-07-22T00:00:00.000Z",
    type,
  };
}

describe("AttachmentSchemaCompiler", () => {
  it("extracts direct, optional, and null AttachmentRef fields", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          `input AttachFileInput {
            requiredRef: AttachmentRef!
            optionalRef: AttachmentRef
          }`,
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_FILE",
    );

    expect(
      extractor.extract(
        action("ATTACH_FILE", { requiredRef: REF_A, optionalRef: null }),
      ),
    ).toEqual([REF_A]);
    expect(
      extractor.extract(
        action("ATTACH_FILE", {
          requiredRef: REF_A,
          optionalRef: REF_B,
        }),
      ),
    ).toEqual([REF_A, REF_B]);
  });

  it("extracts lists, nested and reused inputs, multiple refs, and deterministic duplicates", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILES",
          `input AttachFilesInput {
            direct: AttachmentRef
            nested: NestedAttachmentInput
            list: [AttachmentRef]
            left: NestedAttachmentInput
            right: NestedAttachmentInput
          }

          input NestedAttachmentInput {
            ref: AttachmentRef
            refs: [AttachmentRef!]
          }`,
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_FILES",
    );

    expect(
      extractor.extract(
        action("ATTACH_FILES", {
          direct: REF_A,
          left: { ref: REF_B },
          list: [null, REF_B, REF_C],
          nested: { ref: REF_A, refs: [REF_B, REF_A] },
          right: { refs: [REF_C] },
        }),
      ),
    ).toEqual([REF_A, REF_B, REF_C]);
  });

  it("supports recursive and cyclic input definitions", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_TREE",
          `input AttachTreeInput {
            root: AttachmentNodeInput
          }

          input AttachmentNodeInput {
            ref: AttachmentRef
            next: AttachmentNodeInput
            children: [AttachmentNodeInput!]
          }`,
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_TREE",
    );

    expect(
      extractor.extract(
        action("ATTACH_TREE", {
          root: {
            children: [{ ref: REF_C }],
            next: { next: { ref: REF_B } },
            ref: REF_A,
          },
        }),
      ),
    ).toEqual([REF_A, REF_B, REF_C]);
  });

  it("returns no refs for no-ref actions and String lookalikes", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "SET_DESCRIPTION",
          `input SetDescriptionInput {
            description: String!
            metadata: Unknown
          }`,
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "SET_DESCRIPTION",
    );

    expect(
      extractor.extract(
        action("SET_DESCRIPTION", {
          description: REF_A,
          metadata: { attachment: REF_B },
        }),
      ),
    ).toEqual([]);
  });

  it("fails closed on malformed declared refs without exposing their values", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          "input AttachFileInput { ref: AttachmentRef! }",
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_FILE",
    );
    const malformed = "private-operation-input-value";

    expect(() =>
      extractor.extract(action("ATTACH_FILE", { ref: malformed })),
    ).toThrow(
      'Attachment extraction failed for document type "example/attachment-document", version 1, action "ATTACH_FILE" at input.ref: the AttachmentRef is malformed',
    );
    try {
      extractor.extract(action("ATTACH_FILE", { ref: malformed }));
    } catch (error) {
      expect(String(error)).not.toContain(malformed);
    }
  });

  it("fails closed on required and structural mismatches along declared paths", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILES",
          `input AttachFilesInput {
            nested: NestedInput!
            refs: [AttachmentRef!]!
          }
          input NestedInput { ref: AttachmentRef! }`,
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_FILES",
    );

    expect(() =>
      extractor.extract(
        action("ATTACH_FILES", { nested: null, refs: [REF_A] }),
      ),
    ).toThrow("a required value is missing or null");
    expect(() =>
      extractor.extract(
        action("ATTACH_FILES", { nested: { ref: REF_A }, refs: REF_B }),
      ),
    ).toThrow("expected a list");
    expect(() =>
      extractor.extract(
        action("ATTACH_FILES", { nested: REF_A, refs: [REF_B] }),
      ),
    ).toThrow("expected an input object");
  });

  it("rejects cyclic runtime values even when the recursive schema is valid", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_TREE",
          `input AttachTreeInput { root: NodeInput }
           input NodeInput { ref: AttachmentRef next: NodeInput }`,
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_TREE",
    );
    const root: { next?: unknown; ref: string } = { ref: REF_A };
    root.next = root;

    expect(() => extractor.extract(action("ATTACH_TREE", { root }))).toThrow(
      "the input value contains a cycle",
    );
  });

  it("rejects malformed and ambiguous schemas with context", () => {
    const malformed = documentModule([
      specification(1, [
        operation("ATTACH_FILE", "input AttachFileInput { ref: }"),
      ]),
    ]);
    const ambiguous = documentModule([
      specification(1, [
        operation(
          "attach-file",
          "input AttachFileInput { ref: AttachmentRef }",
        ),
        operation(
          "ATTACH_FILE",
          "input AttachFileInputV2 { ref: AttachmentRef }",
        ),
      ]),
    ]);
    const compiler = new AttachmentSchemaCompiler();

    expect(() => compiler.forModuleAction(malformed, "ATTACH_FILE")).toThrow(
      'Attachment schema compilation failed for document type "example/attachment-document", version 1, action "ATTACH_FILE": an operation has invalid GraphQL SDL',
    );
    expect(() => compiler.forModuleAction(ambiguous, "ATTACH_FILE")).toThrow(
      "multiple operations map to the action",
    );
  });

  it("rejects duplicate input definitions as ambiguous", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          `input AttachFileInput { nested: SharedInput }
           input SharedInput { ref: AttachmentRef }`,
        ),
        operation(
          "OTHER_ACTION",
          `input OtherActionInput { nested: SharedInput }
           input SharedInput { ref: AttachmentRef }`,
        ),
      ]),
    ]);

    expect(() =>
      new AttachmentSchemaCompiler().forModuleAction(module, "ATTACH_FILE"),
    ).toThrow("the effective GraphQL schema is invalid");
  });

  it("validates and merges input extensions through the package entrypoint", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          `input AttachFileInput { primary: AttachmentRef }
           extend input AttachFileInput { secondary: AttachmentRef }`,
        ),
      ]),
    ]);

    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_FILE",
    );
    expect(
      extractor.extract(
        action("ATTACH_FILE", { primary: REF_A, secondary: REF_B }),
      ),
    ).toEqual([REF_A, REF_B]);
  });

  it("rejects unknown input types and operation-local codegen scalar declarations", () => {
    const missingType = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          "input AttachFileInput { nested: MissingInput }",
        ),
      ]),
    ]);
    const duplicateScalar = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          `scalar AttachmentRef
           input AttachFileInput { ref: AttachmentRef }`,
        ),
      ]),
    ]);
    const compiler = new AttachmentSchemaCompiler();

    expect(() => compiler.forModuleAction(missingType, "ATTACH_FILE")).toThrow(
      "the effective GraphQL schema is invalid",
    );
    expect(() =>
      compiler.forModuleAction(duplicateScalar, "ATTACH_FILE"),
    ).toThrow("the effective GraphQL schema is invalid");
  });

  it("allows omitted non-null fields with defaults but rejects explicit null", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          `input AttachFileInput {
            ref: AttachmentRef! = "${REF_A}"
          }`,
        ),
      ]),
    ]);
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_FILE",
    );

    expect(extractor.extract(action("ATTACH_FILE", {}))).toEqual([]);
    expect(
      extractor.extract(action("ATTACH_FILE", { ref: undefined })),
    ).toEqual([]);
    expect(() =>
      extractor.extract(action("ATTACH_FILE", { ref: null })),
    ).toThrow("a required value is missing or null");
    expect(extractor.extract(action("ATTACH_FILE", { ref: REF_B }))).toEqual([
      REF_B,
    ]);
  });

  it("treats undeclared (base/system) actions as the no-reference fast path", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          "input AttachFileInput { ref: AttachmentRef }",
        ),
      ]),
    ]);
    const compiler = new AttachmentSchemaCompiler();

    // Base document actions (e.g. CREATE_DOCUMENT, SET_NAME) are not part of
    // any module specification; they cannot carry schema-declared refs and
    // must not wedge the projection stream.
    const extractor = compiler.forModuleAction(module, "CREATE_DOCUMENT");
    expect(
      extractor.extract(action("CREATE_DOCUMENT", { ref: REF_A })),
    ).toEqual([]);
  });

  it("rejects mismatched extractor actions", () => {
    const module = documentModule([
      specification(1, [
        operation(
          "ATTACH_FILE",
          "input AttachFileInput { ref: AttachmentRef }",
        ),
      ]),
    ]);
    const compiler = new AttachmentSchemaCompiler();

    const extractor = compiler.forModuleAction(module, "ATTACH_FILE");
    expect(() =>
      extractor.extract(action("OTHER_ACTION", { ref: REF_A })),
    ).toThrow("the action type does not match the compiled schema");
  });

  it("selects the specification matching the concrete module version", () => {
    const module = documentModule(
      [
        specification(1, [
          operation(
            "ATTACH_FILE",
            "input AttachFileInput { legacyRef: AttachmentRef }",
          ),
        ]),
        specification(2, [
          operation(
            "ATTACH_FILE",
            "input AttachFileInput { currentRef: AttachmentRef }",
          ),
        ]),
      ],
      2,
    );
    const extractor = new AttachmentSchemaCompiler().forModuleAction(
      module,
      "ATTACH_FILE",
    );

    expect(
      extractor.extract(
        action("ATTACH_FILE", { legacyRef: REF_A, currentRef: REF_C }),
      ),
    ).toEqual([REF_C]);
  });

  it("caches by module identity and action type", () => {
    const specs = [
      specification(1, [
        operation(
          "ATTACH_FILE",
          "input AttachFileInput { ref: AttachmentRef }",
        ),
      ]),
    ];
    const firstModule = documentModule(specs);
    const secondModule = documentModule(specs);
    const compiler = new AttachmentSchemaCompiler();

    const first = compiler.forModuleAction(firstModule, "ATTACH_FILE");
    expect(compiler.forModuleAction(firstModule, "ATTACH_FILE")).toBe(first);
    expect(compiler.forModuleAction(secondModule, "ATTACH_FILE")).not.toBe(
      first,
    );
  });
});
