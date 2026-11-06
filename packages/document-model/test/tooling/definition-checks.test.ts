import {
  defaultBaseState,
  type DefinitionDiagnostic,
  type DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineDocumentModel, materialize, ph } from "../../index.js";
import { defineScalar } from "../../scalars.js";
import { canonicalDigest } from "../../src/definition/kernel/primitives.js";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/tooling/adapters/code-first-document-model-source-adapter.js";
import type { NormalizedDocumentModelArtifact } from "../../src/definition/tooling/adapters/types.js";
import {
  checkProjectDefinitions,
  documentModelChecks,
} from "../../src/definition/tooling/check/check-project-definitions.js";
import type { DefinitionCheck } from "../../src/definition/tooling/check/types.js";
import type { DefinitionCheckInput } from "../../src/definition/tooling/report/types.js";
import type { DefinitionSourceSet } from "../../src/definition/tooling/definition-source-types.js";
import { adaptSchemaFirstDocumentModelModule } from "../../src/definition/tooling/schema-first/schema-first-document-model-module-adapter.js";
import { storedModelRelocation } from "../../src/definition/tooling/schema-first/stored-locations.js";
import {
  codeFirstParity,
  schemaFirstParity,
} from "../definition/fixtures/parity-model.js";
import { operation, storedModel } from "./project-fixtures.js";

const CODE_FIRST: DefinitionSource = { specifier: "./src/parity.ts" };
const STORED: DefinitionSource = {
  specifier: "./document-models/parity/parity.json",
};

function sourceSet(...sources: DefinitionSource[]): DefinitionSourceSet {
  const value = { mode: "code-first", origin: "config", sources } as const;
  return { ...value, digest: canonicalDigest(value) };
}

function codeFirst(
  value: unknown,
  source: DefinitionSource = CODE_FIRST,
): NormalizedDocumentModelArtifact {
  const result = adaptCodeFirstDocumentModelSource(value, source);
  expect(result.diagnostics).toEqual([]);
  return result.artifacts[0];
}

/** Artifacts adapted from a stored file, which `checked` relocates as the schema-first producer does. */
const storedFiles = new WeakSet<NormalizedDocumentModelArtifact>();

function schemaFirst(
  stored: unknown,
  source: DefinitionSource = STORED,
): NormalizedDocumentModelArtifact {
  const result = adaptSchemaFirstDocumentModelModule(
    { ...defaultBaseState(), global: stored, local: {} },
    source,
  );
  expect(result.diagnostics).toEqual([]);
  storedFiles.add(result.artifacts[0]);
  return result.artifacts[0];
}

const check = (name: string): DefinitionCheck => {
  const found = documentModelChecks.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no check ${name}`);
  return found;
};

async function run(
  name: string,
  input: Partial<DefinitionCheckInput>,
): Promise<readonly DefinitionDiagnostic[]> {
  return check(name).run({
    sourceSet: sourceSet(CODE_FIRST),
    artifacts: [],
    unregistered: [],
    ...input,
  });
}

const codes = (diagnostics: readonly DefinitionDiagnostic[]) =>
  diagnostics.map(({ code, path, source }) => ({ code, path, source }));

/** Every registered check over the artifacts, as `ph model check` reports them. */
async function checked(...artifacts: NormalizedDocumentModelArtifact[]) {
  const report = await checkProjectDefinitions({
    sourceSet: sourceSet(CODE_FIRST),
    artifacts,
    unregistered: [],
    diagnostics: [],
    relocations: new Map(
      artifacts
        .filter((artifact) => storedFiles.has(artifact))
        .map((artifact) => [
          artifact.source.specifier,
          storedModelRelocation(artifact),
        ]),
    ),
  });
  return { status: report.status, diagnostics: codes(report.diagnostics) };
}

type StoredGlobal = (typeof codeFirstParity)["documentModel"]["global"];
type StoredSpecification = StoredGlobal["specifications"][number];

/** The parity module with its stored model edited the way a hand-made module could be. */
function forgedParity(edit: (global: StoredGlobal) => unknown): unknown {
  return {
    ...codeFirstParity,
    documentModel: {
      ...codeFirstParity.documentModel,
      global: edit(codeFirstParity.documentModel.global),
    },
  };
}

function forgedServed(
  edit: (specification: StoredSpecification) => unknown,
): unknown {
  return forgedParity((global) => ({
    ...global,
    specifications: global.specifications.map(edit),
  }));
}

const STORED_SPECIFICATION = [
  "documentModel",
  "global",
  "specifications",
  0,
] as const;

function ledger(options: {
  readonly id?: string;
  readonly scalar?: ReturnType<typeof defineScalar>;
  readonly errors?: Record<string, { readonly code: string }>;
}) {
  const model = defineDocumentModel({
    id: options.id ?? "test/ledger",
    name: "Ledger",
    description: "",
    extension: ".ledger",
    version: 1,
    author: { name: "Fixture", website: null },
    scopes: {
      global: {
        schema: ph.object("LedgerState", {
          fields: {
            total: ph.Int({ required: true }),
            ...(options.scalar !== undefined && {
              iban: ph.scalar(options.scalar),
            }),
          },
        }),
        initialValue: { total: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const entries = model.module("entries", {
    operations: ({ global }) => ({
      addAmount: global({
        input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
        errors: options.errors ?? {},
        reduce(state, input) {
          state.total += input.amount;
        },
      }),
    }),
  });
  return materialize(model.version({ modules: [entries] }));
}

describe("the default check registry", () => {
  it("runs every check in a fixed order", () => {
    expect(documentModelChecks.map(({ name }) => name)).toEqual([
      "stored-materialization",
      "duplicate-identities",
      "package-scalar-names",
      "logical-collisions",
      "graphql-schema",
      "retained-serialization",
      "unregistered-definitions",
    ]);
  });

  it("reports nothing for clean code-first and schema-first models", async () => {
    const artifacts = [
      codeFirst(codeFirstParity),
      schemaFirst(schemaFirstParity.documentModel.global, {
        specifier: "./document-models/other/other.json",
      }),
    ];
    // The two share test/parity@1; only the collision check may speak.
    for (const { name } of documentModelChecks) {
      const diagnostics = await run(name, { artifacts });
      expect({
        name,
        codes: codes(diagnostics).map(({ code }) => code),
      }).toEqual({
        name,
        codes:
          name === "logical-collisions" ? ["PH-PKG-LOGICAL-COLLISION"] : [],
      });
    }
  });
});

describe("stored-materialization", () => {
  const { global } = codeFirstParity.documentModel;
  const [specification] = global.specifications;

  it("reports a stored initial value the definition does not materialize", async () => {
    const forged = {
      ...codeFirstParity,
      documentModel: {
        ...codeFirstParity.documentModel,
        global: {
          ...global,
          specifications: [
            {
              ...specification,
              state: {
                ...specification.state,
                global: {
                  ...specification.state.global,
                  initialValue: '{"title":"forged","todos":[]}',
                },
              },
            },
          ],
        },
      },
    };
    const [diagnostic] = await run("stored-materialization", {
      artifacts: [codeFirst(forged)],
    });
    expect(diagnostic).toMatchObject({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      source: CODE_FIRST,
      definition: { kind: "document-model", key: "test/parity", version: 1 },
      path: [
        "documentModel",
        "global",
        "specifications",
        0,
        "state",
        "global",
        "initialValue",
      ],
      expected: specification.state.global.initialValue,
      received: '{"title":"forged","todos":[]}',
    });
  });

  it("reports a stored history that covers other versions", async () => {
    const forged = {
      ...codeFirstParity,
      documentModel: {
        ...codeFirstParity.documentModel,
        global: {
          ...global,
          specifications: [specification, { ...specification, version: 2 }],
        },
      },
    };
    expect(
      await run("stored-materialization", { artifacts: [codeFirst(forged)] }),
    ).toMatchObject([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["documentModel", "global", "specifications"],
        expected: "[1]",
        received: "[1,2]",
      },
    ]);
  });
});

describe("checks that read the stored model", () => {
  it.each([
    [
      "a history that is not an array",
      forgedParity((global) => ({ ...global, specifications: null })),
      ["documentModel", "global", "specifications"],
      "null",
    ],
    [
      "a served specification without its global state",
      forgedServed((specification) => ({
        ...specification,
        state: { local: specification.state.local },
      })),
      [...STORED_SPECIFICATION, "state", "global"],
      "undefined",
    ],
    [
      "an initial value that is not a string",
      forgedServed((specification) => ({
        ...specification,
        state: {
          ...specification.state,
          global: { ...specification.state.global, initialValue: 42 },
        },
      })),
      [...STORED_SPECIFICATION, "state", "global", "initialValue"],
      "number",
    ],
    [
      "an operation schema that is not a string",
      forgedServed((specification) => ({
        ...specification,
        modules: specification.modules.map((module, index) =>
          index === 0
            ? {
                ...module,
                operations: module.operations.map((operation, at) =>
                  at === 0 ? { ...operation, schema: 7 } : operation,
                ),
              }
            : module,
        ),
      })),
      [...STORED_SPECIFICATION, "modules", 0, "operations", 0, "schema"],
      "number",
    ],
  ])(
    "report %s once instead of throwing",
    async (_, module, path, received) => {
      const report = await checkProjectDefinitions({
        sourceSet: sourceSet(CODE_FIRST),
        artifacts: [codeFirst(module)],
        unregistered: [],
        diagnostics: [],
      });
      expect({
        status: report.status,
        diagnostics: report.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          path: diagnostic.path,
          source: diagnostic.source,
          received: diagnostic.received,
        })),
      }).toEqual({
        status: "invalid",
        diagnostics: [
          {
            code: "PH-DM-DECLARATION-INVALID",
            path,
            source: CODE_FIRST,
            received,
          },
        ],
      });
    },
  );
});

describe("duplicate-identities", () => {
  it("reports two schema-first operations that persist one action type", async () => {
    const stored = JSON.parse(
      storedModel("test/shelf", "Shelf", {
        modules: [
          {
            id: "main",
            name: "main",
            description: null,
            operations: [
              operation(
                "SET_TITLE",
                "input SetTitleInput {\n  title: String!\n}",
              ),
            ],
          },
          {
            id: "extra",
            name: "extra",
            description: null,
            operations: [{ ...operation("set_title", null), id: "again" }],
          },
        ],
      }),
    ) as unknown;
    const diagnostics = await run("duplicate-identities", {
      artifacts: [schemaFirst(stored)],
    });
    expect(diagnostics).toEqual([
      {
        code: "PH-DM-DUPLICATE-ACTION",
        severity: "error",
        phase: "definition",
        source: STORED,
        definition: { kind: "document-model", key: "test/shelf", version: 1 },
        path: ["specifications", 0, "modules", 1, "operations", 0],
        message:
          'operation "extra.setTitle" and operation "main.setTitle" share the action type SET_TITLE.',
        expected: "one declaration per action type",
        received: "SET_TITLE",
        repair:
          "Rename one of the operations; a replayed history cannot tell which reducer wrote a shared action type.",
        related: [
          {
            source: STORED,
            path: ["specifications", 0, "modules", 0, "operations", 0],
            message: 'operation "main.setTitle" claims it first.',
          },
        ],
      },
    ]);
  });

  it("reports two schema-first modules with one key", async () => {
    const stored = JSON.parse(
      storedModel("test/shelf", "Shelf", {
        modules: [
          {
            id: "a",
            name: "main",
            description: null,
            operations: [
              operation(
                "SET_TITLE",
                "input SetTitleInput {\n  title: String!\n}",
              ),
            ],
          },
          {
            id: "b",
            name: "Main",
            description: null,
            operations: [{ ...operation("CLEAR", null), id: "clear" }],
          },
        ],
      }),
    ) as unknown;
    expect(
      codes(
        await run("duplicate-identities", { artifacts: [schemaFirst(stored)] }),
      ),
    ).toEqual([
      {
        code: "PH-DM-DUPLICATE-NAME",
        path: ["specifications", 0, "modules", 1],
        source: STORED,
      },
    ]);
  });

  it("reports two errors of one code-first operation that share a code", async () => {
    const diagnostics = await run("duplicate-identities", {
      artifacts: [
        codeFirst(
          ledger({
            errors: { Overdrawn: { code: "LIMIT" }, Frozen: { code: "LIMIT" } },
          }),
        ),
      ],
    });
    expect(
      diagnostics.map(({ code, path, message }) => ({ code, path, message })),
    ).toEqual([
      {
        code: "PH-DM-DUPLICATE-ERROR-CODE",
        path: ["specifications", 0, "modules", 0, "operations", 0, "errors", 1],
        message: 'error "Frozen" and error "Overdrawn" share the code LIMIT.',
      },
    ]);
  });

  it("reports one error name with two codes across a module's operations", async () => {
    const stored = JSON.parse(
      storedModel("test/shelf", "Shelf", {
        modules: [
          {
            id: "main",
            name: "main",
            description: null,
            operations: [
              operation(
                "SET_TITLE",
                "input SetTitleInput {\n  title: String!\n}",
                [{ id: "first", name: "Conflict", code: "A" }],
              ),
              {
                ...operation("CLEAR", null, [
                  { id: "second", name: "Conflict", code: "B" },
                ]),
                id: "clear",
              },
            ],
          },
        ],
      }),
    ) as unknown;
    const report = await checked(schemaFirst(stored));
    expect(report).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DM-ERROR-CLASS-CONFLICT",
          path: [
            "specifications",
            0,
            "modules",
            0,
            "operations",
            1,
            "errors",
            0,
          ],
          source: STORED,
        },
      ],
    });
    const [diagnostic] = await run("duplicate-identities", {
      artifacts: [schemaFirst(stored)],
    });
    expect(diagnostic.message).toBe(
      'error "Conflict" of operation "main.clear" gives the error class Conflict the code "B", and error "Conflict" of operation "main.setTitle" gives it "A".',
    );
  });

  it("compares the codes codegen generates, so an empty code is the error name", async () => {
    const stored = JSON.parse(
      storedModel("test/shelf", "Shelf", {
        modules: [
          {
            id: "main",
            name: "main",
            description: null,
            operations: [
              operation(
                "SET_TITLE",
                "input SetTitleInput {\n  title: String!\n}",
                [
                  { id: "missing", name: "Missing", code: "" },
                  { id: "gone", name: "Gone", code: " Missing " },
                ],
              ),
            ],
          },
        ],
      }),
    ) as unknown;
    expect(await checked(schemaFirst(stored))).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DM-DUPLICATE-ERROR-CODE",
          path: [
            "specifications",
            0,
            "modules",
            0,
            "operations",
            0,
            "errors",
            1,
          ],
          source: STORED,
        },
      ],
    });
  });

  it("keeps operations apart whose names generate different action creators", async () => {
    const stored = JSON.parse(
      storedModel("test/shelf", "Shelf", {
        modules: [
          {
            id: "main",
            name: "main",
            description: null,
            operations: [
              operation("API1foo", "input Api1fooInput {\n  value: String\n}"),
              {
                ...operation(
                  "API1FOO",
                  "input Api1FooInput {\n  value: String\n}",
                ),
                id: "upper",
              },
            ],
          },
        ],
      }),
    ) as unknown;
    const artifact = schemaFirst(stored);
    expect(
      artifact.definition.specifications[0].modules[0].operations.map(
        ({ key, creatorKey, actionType }) => [key, creatorKey, actionType],
      ),
    ).toEqual([
      ["api1foo", "api1foo", "API1FOO"],
      ["api1Foo", "api1Foo", "API1_FOO"],
    ]);
    expect(await checked(artifact)).toEqual({ status: "ok", diagnostics: [] });
  });

  it("accepts distinct identities", async () => {
    expect(
      await run("duplicate-identities", {
        artifacts: [
          codeFirst(
            ledger({
              errors: {
                Overdrawn: { code: "OVER" },
                Frozen: { code: "FROZEN" },
              },
            }),
          ),
          schemaFirst(schemaFirstParity.documentModel.global),
        ],
      }),
    ).toEqual([]);
  });
});

describe("package-scalar-names", () => {
  const iban = (description: string) =>
    defineScalar({ name: "Iban", description, schema: z.string() });

  it("reports two different package scalars with one name across models", async () => {
    const shared = iban("shared");
    const diagnostics = await run("package-scalar-names", {
      artifacts: [
        codeFirst(ledger({ id: "test/a", scalar: shared }), {
          specifier: "./src/a.ts",
        }),
        codeFirst(ledger({ id: "test/b", scalar: shared }), {
          specifier: "./src/b.ts",
        }),
        codeFirst(ledger({ id: "test/c", scalar: iban("other") }), {
          specifier: "./src/c.ts",
        }),
      ],
    });
    expect(diagnostics).toMatchObject([
      {
        code: "PH-PKG-SCALAR-CONFLICT",
        source: { specifier: "./src/c.ts" },
        definition: { kind: "scalar", key: "Iban" },
        path: ["specifications", 0, "scalars", 0],
        related: [
          {
            source: { specifier: "./src/a.ts" },
            path: ["specifications", 0, "scalars", 0],
          },
        ],
      },
    ]);
  });
});

describe("logical-collisions", () => {
  it("reports a stored model that claims a selected source's documentType@version", async () => {
    expect(
      await run("logical-collisions", {
        artifacts: [
          schemaFirst(schemaFirstParity.documentModel.global),
          codeFirst(codeFirstParity),
        ],
      }),
    ).toEqual([
      {
        code: "PH-PKG-LOGICAL-COLLISION",
        severity: "error",
        phase: "package",
        source: CODE_FIRST,
        definition: { kind: "document-model", key: "test/parity", version: 1 },
        path: [],
        message:
          "Two sources claim test/parity@1, and a host registers one module per document type and version.",
        expected: "one source for test/parity@1",
        received: "./document-models/parity/parity.json and ./src/parity.ts",
        repair:
          "Keep one of the two models, or give one of them another document type.",
        related: [
          {
            source: STORED,
            path: [],
            message: "This source also claims test/parity@1.",
          },
        ],
      },
    ]);
  });

  it("leaves a collision between two selected sources to the loader", async () => {
    const other = { specifier: "./src/other.ts" } as const;
    expect(
      await run("logical-collisions", {
        sourceSet: sourceSet(CODE_FIRST, other),
        artifacts: [
          codeFirst(codeFirstParity),
          codeFirst(codeFirstParity, other),
        ],
      }),
    ).toEqual([]);
  });
});

describe("graphql-schema", () => {
  const shelf = (schema: string) =>
    schemaFirst(
      JSON.parse(storedModel("test/shelf", "Shelf", { globalSchema: schema })),
    );

  it("reports an implementation that drops an interface field argument", async () => {
    const artifact = shelf(
      "interface Named {\n  title(locale: String): String!\n}\n\ntype ShelfState implements Named {\n  title: String!\n}",
    );
    const owner = artifact.definition.specifications[0].types.findIndex(
      ({ name }) => name === "ShelfState",
    );
    const diagnostics = await run("graphql-schema", {
      artifacts: [artifact],
    });
    expect(diagnostics).toMatchObject([
      {
        code: "PH-DM-INTERFACE-INVALID",
        source: STORED,
        path: ["specifications", 0, "types", owner],
        message:
          "Interface field argument Named.title(locale:) expected but ShelfState.title does not provide it.",
      },
    ]);
    expect((await checked(artifact)).diagnostics).toEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: ["specifications", 0, "state", "global", "schema"],
        source: STORED,
      },
    ]);
  });

  it("points at the stored operation schema that declares the implementing type", async () => {
    const stored = JSON.parse(
      storedModel("test/shelf", "Shelf", {
        globalSchema:
          "interface Named {\n  label: String!\n}\n\ntype ShelfState {\n  title: String!\n}",
        modules: [
          {
            id: "main",
            name: "main",
            description: null,
            operations: [
              operation(
                "SET_TITLE",
                "input SetTitleInput {\n  title: String!\n}\n\ntype Labelled implements Named {\n  title: String\n}",
              ),
            ],
          },
        ],
      }),
    ) as unknown;
    expect(await checked(schemaFirst(stored))).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DM-INTERFACE-INVALID",
          path: ["specifications", 0, "modules", 0, "operations", 0, "schema"],
          source: STORED,
        },
      ],
    });
  });

  it("builds a stored schema whose project scalar only a type extension uses", async () => {
    const Iban = defineScalar({ name: "Iban", schema: z.string() });
    const result = adaptSchemaFirstDocumentModelModule(
      {
        ...defaultBaseState(),
        global: JSON.parse(
          storedModel("test/shelf", "Shelf", {
            globalSchema:
              "type ShelfState {\n  title: String!\n}\n\nextend type ShelfState {\n  iban: Iban\n}",
          }),
        ) as unknown,
        local: {},
      },
      STORED,
      { scalars: [Iban] },
    );
    expect(result.diagnostics).toEqual([]);
    const [specification] = result.artifacts[0].definition.specifications;
    expect(specification.types).toMatchObject([
      {
        name: "ShelfState",
        fields: [
          { name: "title" },
          { name: "iban", type: { kind: "scalar", name: "Iban" } },
        ],
      },
    ]);
    expect(specification.scalars.map(({ name }) => name)).toEqual(["Iban"]);
    expect(await checked(...result.artifacts)).toEqual({
      status: "ok",
      diagnostics: [],
    });
  });

  it("accepts an implementation that satisfies its interface", async () => {
    expect(
      await run("graphql-schema", {
        artifacts: [
          shelf(
            "interface Named {\n  title(locale: String): String!\n}\n\ntype ShelfState implements Named {\n  title(locale: String): String!\n}",
          ),
        ],
      }),
    ).toEqual([]);
  });
});

describe("stored model relocation", () => {
  it("maps a check's normalized paths to the stored file its author edits", () => {
    const artifact = schemaFirst(
      JSON.parse(
        storedModel("test/shelf", "Shelf", {
          modules: [
            {
              id: "main",
              name: "main",
              description: null,
              operations: [
                operation(
                  "SET_TITLE",
                  "input SetTitleInput {\n  title: String!\n}\n\ntype Label {\n  text: String\n}",
                ),
              ],
            },
          ],
        }),
      ),
    );
    const [specification] = artifact.definition.specifications;
    const type = (name: string) =>
      specification.types.findIndex((entry) => entry.name === name);
    const node = (name: string) =>
      (
        specification.graphQLCompatibility?.document.definitions as
          | readonly { readonly name?: { readonly value: string } }[]
          | undefined
      )?.findIndex((entry) => entry.name?.value === name);
    const operationSchema = [
      "specifications",
      0,
      "modules",
      0,
      "operations",
      0,
      "schema",
    ];
    const relocate = storedModelRelocation(artifact);
    expect(
      [
        [...STORED_SPECIFICATION, "state", "global", "initialValue"],
        ["specifications", 0, "types", type("ShelfState")],
        ["specifications", 0, "types", type("Label")],
        [
          "specifications",
          0,
          "graphQLCompatibility",
          "document",
          "definitions",
          node("Label") ?? -1,
        ],
        ["specifications", 0, "graphQLCompatibility"],
        ["specifications", 0, "modules", 0, "operations", 0, "errors", 0],
        ["specifications", 0, "state", "global", "schema", "ShelfState"],
        ["specifications", 0, "state", "global", "root"],
        ["specifications", 0, "scalars", 0],
      ].map(relocate),
    ).toEqual([
      ["specifications", 0, "state", "global", "initialValue"],
      ["specifications", 0, "state", "global", "schema"],
      operationSchema,
      operationSchema,
      ["specifications", 0],
      ["specifications", 0, "modules", 0, "operations", 0, "errors"],
      ["specifications", 0, "state", "global", "schema"],
      ["specifications", 0, "state", "global"],
      ["specifications", 0],
    ]);
  });
});

describe("retained-serialization", () => {
  const [stored] = codeFirstParity.documentModel.global.specifications;
  const storedSchema = stored.state.global.schema;
  const withGlobalSchema = (schema: string) =>
    codeFirst(
      forgedServed((specification) => ({
        ...specification,
        state: {
          ...specification.state,
          global: { ...specification.state.global, schema },
        },
      })),
    );

  it("reports a forged stored state schema on a code-first module", async () => {
    expect(
      await checked(withGlobalSchema("type ParityState {\n  forged: Int\n}")),
    ).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DEF-COMPATIBILITY-INVALID",
          path: [...STORED_SPECIFICATION, "state", "global", "schema"],
          source: CODE_FIRST,
        },
      ],
    });
  });

  it("reports a stored segment that describes a type differently", async () => {
    const diagnostics = await run("retained-serialization", {
      artifacts: [
        withGlobalSchema(
          storedSchema.replace("completed: Boolean!", "done: Boolean!"),
        ),
      ],
    });
    expect(codes(diagnostics)).toEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: [
          ...STORED_SPECIFICATION,
          "state",
          "global",
          "schema",
          "ParityItem",
        ],
        source: CODE_FIRST,
      },
    ]);
    expect(diagnostics[0].message).toBe(
      "The stored schema segment describes ParityItem differently than the definition.",
    );
  });

  it("reports a stored segment that is not SDL", async () => {
    expect(
      (
        await run("retained-serialization", {
          artifacts: [withGlobalSchema("type {")],
        })
      ).map(({ code, path, received }) => ({ code, path, received })),
    ).toEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: [...STORED_SPECIFICATION, "state", "global", "schema"],
        received: "type {",
      },
    ]);
  });

  it("accepts a reordered stored segment", async () => {
    const [state, item] = storedSchema.trimEnd().split("\n\n");
    expect(
      await run("retained-serialization", {
        artifacts: [withGlobalSchema(`${item}\n\n${state}\n`)],
      }),
    ).toEqual([]);
  });
});

describe("unregistered-definitions", () => {
  it("turns each unregistered declaration into one package diagnostic", async () => {
    expect(
      await run("unregistered-definitions", {
        unregistered: [
          {
            kind: "document-model",
            unit: "./document-models/notes/",
            specifier: "./document-models/notes/index.ts",
            reason: "unreached",
          },
          {
            kind: "document-model",
            unit: "./document-models/orders/",
            specifier: "./document-models/orders/index.ts",
            reason: "not-exported",
          },
        ],
      }).then((diagnostics) =>
        diagnostics.map(({ source, message, expected, received }) => ({
          source,
          message,
          expected,
          received,
        })),
      ),
    ).toEqual([
      {
        source: { specifier: "./document-models/notes/index.ts" },
        message:
          "./document-models/notes/ declares a code-first document model that no definitionSources entry reaches, so the package leaves it out.",
        expected:
          "a definitionSources entry that reaches ./document-models/notes/index.ts",
        received: "no entry",
      },
      {
        source: { specifier: "./document-models/orders/index.ts" },
        message:
          "./document-models/orders/ declares a code-first document model that a selected source imports but does not export, so the package leaves it out.",
        expected:
          "a definitionSources entry that exports the model ./document-models/orders/index.ts declares",
        received: "imported, not exported",
      },
    ]);
    expect(
      await run("unregistered-definitions", {
        unregistered: [
          {
            kind: "document-model",
            unit: "./document-models/notes/",
            specifier: "./document-models/notes/index.ts",
            reason: "unreached",
          },
        ],
      }),
    ).toEqual([
      {
        code: "PH-PKG-DEFINITION-UNREGISTERED",
        severity: "error",
        phase: "package",
        source: { specifier: "./document-models/notes/index.ts" },
        path: [],
        message:
          "./document-models/notes/ declares a code-first document model that no definitionSources entry reaches, so the package leaves it out.",
        expected:
          "a definitionSources entry that reaches ./document-models/notes/index.ts",
        received: "no entry",
        repair:
          'Add { "specifier": "./document-models/notes/index.ts" } to definitionSources.entries in powerhouse.config.json. If definitionSources is absent or schema-first, set it to { "formatVersion": 1, "mode": "code-first", "entries": [{ "specifier": "./document-models/notes/index.ts" }] }; schema-first models keep generating from their stored files.',
      },
    ]);
  });
});

describe("duplicate-identities: platform action types", () => {
  it("reports a schema-first operation whose action type the document runtime reduces", async () => {
    const stored = JSON.parse(
      storedModel("test/shelf", "Shelf", {
        modules: [
          {
            id: "main",
            name: "main",
            description: null,
            operations: [
              operation("SET_NAME", "input SetNameInput {\n  name: String!\n}"),
            ],
          },
        ],
      }),
    ) as unknown;
    const artifact = schemaFirst(stored);
    expect(
      await run("duplicate-identities", { artifacts: [artifact] }),
    ).toEqual([
      {
        code: "PH-DM-DUPLICATE-ACTION",
        severity: "error",
        phase: "definition",
        source: STORED,
        definition: { kind: "document-model", key: "test/shelf", version: 1 },
        path: ["specifications", 0, "modules", 0, "operations", 0, "key"],
        message:
          'operation "main.setName" has action type SET_NAME, which the document runtime reduces itself, so this operation\'s reducer would never run.',
        expected: "an action type the document runtime does not own",
        received: "SET_NAME",
        repair: "Rename the operation.",
      },
    ]);
    expect(await checked(artifact)).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DM-DUPLICATE-ACTION",
          path: ["specifications", 0, "modules", 0, "operations", 0],
          source: STORED,
        },
      ],
    });
  });
});

describe("graphql-schema: graphql-js validation", () => {
  const shelf = (
    globalSchema: string,
    operationSchema?: string,
    initialValue?: string,
  ) =>
    schemaFirst(
      JSON.parse(
        storedModel("test/shelf", "Shelf", {
          globalSchema,
          ...(initialValue !== undefined && { initialValue }),
          ...(operationSchema !== undefined && {
            modules: [
              {
                id: "main",
                name: "main",
                description: null,
                operations: [operation("SET_BALANCE", operationSchema)],
              },
            ],
          }),
        }),
      ),
    );
  const messages = (diagnostics: readonly DefinitionDiagnostic[]) =>
    diagnostics.map(({ code, message }) => ({ code, message }));

  it("reports an operation input that references an output type", async () => {
    const artifact = shelf(
      "type ShelfState {\n  title: String!\n  wallet: WalletState\n}\n\ntype WalletState {\n  balance: Int!\n}",
      "input SetBalanceInput {\n  wallet: WalletState!\n}",
    );
    expect(
      messages(await run("graphql-schema", { artifacts: [artifact] })),
    ).toEqual([
      {
        code: "PH-DM-TYPE-POSITION-INVALID",
        message:
          "The type of SetBalanceInput.wallet must be Input Type but got: WalletState!.",
      },
    ]);
    expect(await checked(artifact)).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DM-TYPE-POSITION-INVALID",
          path: ["specifications", 0, "modules", 0, "operations", 0, "schema"],
          source: STORED,
        },
      ],
    });
  });

  it("reports SDL graphql-js refuses before it builds a schema", async () => {
    const artifact = shelf(
      "type ShelfState {\n  title(locale: String, locale: String): String!\n}",
    );
    expect(
      messages(await run("graphql-schema", { artifacts: [artifact] })),
    ).toEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        message:
          'Argument "ShelfState.title(locale:)" can only be defined once.',
      },
    ]);
    expect(await checked(artifact)).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DEF-COMPATIBILITY-INVALID",
          path: ["specifications", 0, "state", "global", "schema"],
          source: STORED,
        },
      ],
    });
  });

  it("reports a member an extension in another segment defines again", async () => {
    const artifact = shelf(
      "type ShelfState {\n  title: String!\n}",
      "input SetBalanceInput {\n  amount: Int!\n}\n\nextend type ShelfState {\n  title: String\n}",
    );
    expect(
      artifact.definition.specifications[0].types.map((type) =>
        "fields" in type
          ? type.fields.map(({ type: { required } }) => required)
          : [],
      ),
    ).toEqual([[true]]);
    expect(
      messages(await run("graphql-schema", { artifacts: [artifact] })),
    ).toEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        message: 'Field "ShelfState.title" can only be defined once.',
      },
    ]);
    expect(await checked(artifact)).toEqual({
      status: "invalid",
      diagnostics: [
        {
          code: "PH-DEF-COMPATIBILITY-INVALID",
          path: ["specifications", 0, "modules", 0, "operations", 0, "schema"],
          source: STORED,
        },
      ],
    });
  });

  it("accepts a type the stored schema repeats, whose first definition hosts keep", async () => {
    expect(
      await checked(
        shelf(
          "type ShelfState {\n  title: String!\n}",
          "input SetBalanceInput {\n  amount: Int!\n}\n\ntype ShelfState {\n  title: String!\n}",
        ),
      ),
    ).toEqual({ status: "ok", diagnostics: [] });
  });

  it("reports a missing transitive interface on the implementing type", async () => {
    const artifact = shelf(
      "interface Node {\n  id: ID!\n}\n\ninterface Named implements Node {\n  id: ID!\n  title: String!\n}\n\ntype ShelfState implements Named {\n  id: ID!\n  title: String!\n}",
      undefined,
      '{"id":"","title":""}',
    );
    const owner = artifact.definition.specifications[0].types.findIndex(
      ({ name }) => name === "ShelfState",
    );
    expect(
      (await run("graphql-schema", { artifacts: [artifact] })).map(
        ({ code, path, message }) => ({ code, path, message }),
      ),
    ).toEqual([
      {
        code: "PH-DM-INTERFACE-INVALID",
        path: ["specifications", 0, "types", owner],
        message:
          "Type ShelfState must implement Node because it is implemented by Named.",
      },
    ]);
  });

  it("accepts a schema without a Query root", async () => {
    expect(
      await checked(
        shelf(
          "type ShelfState {\n  title: String!\n}\n\nextend type ShelfState {\n  note: String\n}",
        ),
      ),
    ).toEqual({ status: "ok", diagnostics: [] });
  });
});

describe("retained-serialization: folded types and segment sets", () => {
  const [stored] = codeFirstParity.documentModel.global.specifications;
  const forged = (edit: (specification: StoredSpecification) => unknown) =>
    run("retained-serialization", {
      artifacts: [codeFirst(forgedServed(edit))],
    });

  it("compares a stored extension folded into the type it extends", async () => {
    const diagnostics = await forged((specification) => ({
      ...specification,
      state: {
        ...specification.state,
        global: {
          ...specification.state.global,
          schema: `${stored.state.global.schema}\nextend type ParityState {\n  forged: Int\n}\n`,
        },
      },
    }));
    expect(codes(diagnostics)).toEqual([
      {
        code: "PH-DEF-COMPATIBILITY-INVALID",
        path: [
          ...STORED_SPECIFICATION,
          "state",
          "global",
          "schema",
          "ParityState",
        ],
        source: CODE_FIRST,
      },
    ]);
  });

  it("accepts a schema-first extension declared in an operation segment", async () => {
    const artifact = schemaFirst(
      JSON.parse(
        storedModel("test/shelf", "Shelf", {
          modules: [
            {
              id: "main",
              name: "main",
              description: null,
              operations: [
                operation(
                  "SET_TITLE",
                  "input SetTitleInput {\n  title: String!\n}\n\nextend type ShelfState {\n  note: String\n}",
                ),
              ],
            },
          ],
        }),
      ),
    );
    expect(
      artifact.definition.specifications[0].types.map((type) => ({
        name: type.name,
        fields: "fields" in type ? type.fields.map(({ name }) => name) : [],
      })),
    ).toEqual([{ name: "ShelfState", fields: ["title", "note"] }]);
    expect(await checked(artifact)).toEqual({ status: "ok", diagnostics: [] });
  });

  it("reports operations the stored model has no schema segment for", async () => {
    const diagnostics = await forged((specification) => ({
      ...specification,
      modules: [],
    }));
    expect(
      diagnostics.map(({ path, message, expected, received }) => ({
        path,
        message,
        expected,
        received,
      })),
    ).toEqual(
      ["addTodo", "editTitle", "clear", "setNote"].map((key) => ({
        path: [...STORED_SPECIFICATION],
        message: `The stored model has no schema segment for operation todos.${key}.`,
        expected: `a schema segment for todos.${key}`,
        received: "absent",
      })),
    );
  });

  it("reports a stored schema segment of an operation the definition does not declare", async () => {
    const diagnostics = await forged((specification) => ({
      ...specification,
      modules: specification.modules.map((module) => ({
        ...module,
        operations: [
          ...module.operations,
          { ...module.operations[0], id: "extra", name: "Extra" },
        ],
      })),
    }));
    expect(diagnostics.map(({ path, message }) => ({ path, message }))).toEqual(
      [
        {
          path: [
            ...STORED_SPECIFICATION,
            "modules",
            0,
            "operations",
            4,
            "schema",
          ],
          message:
            "The stored schema segment belongs to an operation the definition does not declare.",
        },
      ],
    );
  });
});
