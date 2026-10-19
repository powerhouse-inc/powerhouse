import type {
  DefinitionSource,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  defineScalar,
  ph,
} from "document-model";
import {
  checkDefinitions,
  type DefinitionSourceLoader,
  type LoadedDefinition,
  type LoadedDefinitionSet,
  readSubgraphEntries,
  type SubgraphClass,
} from "document-model/tooling";
import { gql } from "graphql-tag";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { forgetReportedScalarBindings } from "../src/graphql/scalar-bindings.js";
import { SUBGRAPH_PROTOCOL } from "../src/graphql/subgraph-protocol.js";
import type { SchemaBuilder } from "../src/graphql/subgraph-schema.js";
import { validateSubgraphsForHost } from "../src/graphql/subgraph-validation.js";
import { servedSubgraph } from "./utils/served-subgraph.js";
import { sdlBase } from "./utils/sdl-base.js";

/**
 * Validation builds the augmented schema the host assembles and reports a
 * subgraph only when that schema fails to build. A raw author AST that names
 * `OID` is valid because the host declares `OID`.
 */

function entry(
  value: SubgraphClass,
  source: DefinitionSource = { specifier: "./subgraphs/x.ts" },
): LoadedDefinition<SubgraphClass> {
  return { value, source, path: [value.name] };
}

function compat(name: string, sdl: string) {
  return class Compat extends sdlBase(sdl) {
    static override readonly subgraphName = name;
  };
}

function notesModel(): DocumentModelModule {
  return defineDocumentModel({
    id: "test/notes",
    name: "Notes",
    description: "",
    extension: "notes",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("NotesState", { fields: { title: ph.String() } }),
        initialValue: { title: null },
      },
      local: { schema: null, initialValue: {} },
    },
  }).finalize({ modules: [] }) as unknown as DocumentModelModule;
}

const Widget = ph.object("Widget", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});

function widgets(name = "widgets") {
  return class Widgets extends BaseSubgraph {
    static override readonly subgraphName = name;
    static override getSchema(schema: SchemaBuilder<Widgets>) {
      return [
        schema.query("widget", {
          args: { id: ph.OID({ required: true }) },
          returns: ph.ref(Widget, { required: true }),
          resolve: () => ({ id: "w", label: "One" }),
        }),
      ];
    }
  };
}

describe("validating against the augmented schema", () => {
  it("accepts a subgraph that names a host-declared scalar", () => {
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(widgets())],
    });
    expect(result).toEqual({ completed: true, diagnostics: [] });
  });

  it("validates the typed AST the protocol describes, which instances serve", () => {
    const Subgraph = widgets();
    const served = servedSubgraph(
      new Subgraph({} as ConstructorParameters<typeof Subgraph>[0]),
    );
    expect(served.typeDefs).toBe(
      Subgraph[SUBGRAPH_PROTOCOL]().describe().typeDefs,
    );
    expect(
      validateSubgraphsForHost({
        profile: "edit",
        documentModels: [],
        subgraphs: [entry(Subgraph)],
      }).diagnostics,
    ).toEqual([]);
  });

  it("reports a subgraph whose schema cannot build", () => {
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(compat("broken", "type Query { thing: Missing }"))],
    });
    expect(result.completed).toBe(true);
    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "PH-SG-SCHEMA-INVALID",
    ]);
    expect(result.diagnostics[0].message).toContain("Missing");
  });

  it("leaves a class the protocol cannot describe to the tooling", () => {
    class Nameless extends sdlBase("type Query { thing: String }") {}
    expect(
      validateSubgraphsForHost({
        profile: "edit",
        documentModels: [],
        subgraphs: [entry(Nameless)],
      }),
    ).toEqual({ completed: true, diagnostics: [] });
  });

  it("leaves a class whose description throws to the tooling, and checks the others", () => {
    class Throws extends BaseSubgraph {
      static override readonly subgraphName = "throws";
      static override getSchema(): never {
        throw new Error("boom");
      }
    }
    class Unprotocoled {
      static readonly subgraphName = "unprotocoled";
    }
    expect(
      validateSubgraphsForHost({
        profile: "edit",
        documentModels: [],
        subgraphs: [
          entry(Throws),
          entry(Unprotocoled as unknown as SubgraphClass),
          entry(compat("broken", "type Query { thing: Missing }")),
        ],
      }).diagnostics.map(({ code, path, message }) => ({
        code,
        path,
        message,
      })),
    ).toEqual([
      {
        code: "PH-SG-SCHEMA-INVALID",
        path: ["Compat"],
        message:
          'Subgraph "broken" does not build, so the server does not serve it: Unknown type "Missing".',
      },
    ]);
  });

  it("calls no resolver factory", () => {
    let factoryCalls = 0;
    class Subgraph extends BaseSubgraph {
      static override readonly subgraphName = "compat";
      static override getSchema(schema: SchemaBuilder<Subgraph>) {
        return schema.graphql({
          typeDefs: gql`
            type Query {
              thing: String
            }
          `,
          resolverCoordinates: [],
          resolvers: () => {
            factoryCalls += 1;
            return {};
          },
        });
      }
    }
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [entry(Subgraph)],
    });
    expect(result.diagnostics).toEqual([]);
    expect(factoryCalls).toBe(0);
  });
});

describe("the conflicts the server enforces", () => {
  type Finding = { code: string; severity: string; path: readonly unknown[] };
  const findings = (
    subgraphs: readonly SubgraphClass[],
    documentModels: readonly DocumentModelModule[] = [],
  ): Finding[] =>
    validateSubgraphsForHost({
      profile: "release",
      documentModels,
      subgraphs: subgraphs.map((subgraph) => entry(subgraph)),
    }).diagnostics.map(({ code, severity, path }) => ({
      code,
      severity,
      path,
    }));

  function notesWithOperations(): DocumentModelModule {
    const context = defineDocumentModel({
      id: "test/notes",
      name: "Notes",
      description: "",
      extension: "notes",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        global: {
          schema: ph.object("NotesState", { fields: { title: ph.String() } }),
          initialValue: { title: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const edits = context.module("edits", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce(state, input) {
            state.title = input.title;
          },
        }),
      }),
    });
    return context.finalize({
      modules: [edits],
    }) as unknown as DocumentModelModule;
  }

  it("warns that the server refuses a subgraph named like a core subgraph", () => {
    expect(findings([widgets("system")])).toEqual([
      {
        code: "PH-SG-NAME-TAKEN",
        severity: "warning",
        path: ["composition", "system"],
      },
    ]);
  });

  it("warns that the server refuses a subgraph named like a document model's", () => {
    expect(findings([widgets("notes")], [notesWithOperations()])).toEqual([
      {
        code: "PH-SG-NAME-TAKEN",
        severity: "warning",
        path: ["composition", "notes"],
      },
    ]);
  });

  it("warns about a schema-first model's subgraph name and generated types as about a selected model's", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      schemaFirstDocumentModels: [notesWithOperations().documentModel.global],
      subgraphs: [
        entry(widgets("notes")),
        entry(
          compat(
            "ledger",
            "type Query { lastNote: Notes } type Notes { id: ID }",
          ),
        ),
      ],
    });
    expect(
      result.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "PH-SG-NAME-TAKEN",
        'Subgraph "notes" has the name of a document model subgraph, so the server refuses it.',
      ],
      [
        "PH-SG-GENERATED-TYPE-TAKEN",
        'Subgraph "ledger" defines Notes, which document model "Notes" generates, so the server refuses it.',
      ],
    ]);
  });

  it("warns each subgraph that declares a contested root field, without guessing which registers first", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      subgraphs: [entry(widgets("foo-bar")), entry(widgets("foo2"))],
    });
    const message =
      'Subgraphs "foo-bar" and "foo2" both define Query.widget, and the supergraph can include only one of them.';
    expect(
      result.diagnostics.map(({ code, severity, path, message }) => ({
        code,
        severity,
        path,
        message,
      })),
    ).toEqual([
      {
        code: "PH-GQL-COORDINATE-OWNED",
        severity: "warning",
        path: ["composition", "foo-bar", "Query.widget"],
        message,
      },
      {
        code: "PH-GQL-COORDINATE-OWNED",
        severity: "warning",
        path: ["composition", "foo2", "Query.widget"],
        message,
      },
    ]);
  });

  it("names no survivor in a chain of contests, because one lost claim leaves a subgraph out", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      subgraphs: [
        entry(compat("alpha", "type Query { x: String }")),
        entry(compat("beta", "type Query { x: String y: String }")),
        entry(compat("gamma", "type Query { y: String }")),
      ],
    });
    expect(
      result.diagnostics.map(({ path, message }) => [path.join(" "), message]),
    ).toEqual([
      [
        "composition alpha Query.x",
        'Subgraphs "alpha" and "beta" both define Query.x, and the supergraph can include only one of them.',
      ],
      [
        "composition beta Query.x",
        'Subgraphs "alpha" and "beta" both define Query.x, and the supergraph can include only one of them.',
      ],
      [
        "composition beta Query.y",
        'Subgraphs "beta" and "gamma" both define Query.y, and the supergraph can include only one of them.',
      ],
      [
        "composition gamma Query.y",
        'Subgraphs "beta" and "gamma" both define Query.y, and the supergraph can include only one of them.',
      ],
    ]);
  });

  it("warns that a subgraph loses a root field a document model's subgraph owns", () => {
    expect(
      findings(
        [compat("notes-lookup", "type Query { Notes: String }")],
        [notesWithOperations()],
      ),
    ).toEqual([
      {
        code: "PH-GQL-COORDINATE-OWNED",
        severity: "warning",
        path: ["composition", "notes-lookup", "Query.Notes"],
      },
    ]);
  });

  it("warns about a type two subgraphs define differently", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      subgraphs: [
        entry(
          compat("alpha", "type Query { a: Gadget } type Gadget { id: ID! }"),
        ),
        entry(
          compat(
            "beta",
            "type Query { b: Gadget } type Gadget { id: ID! size: Int }",
          ),
        ),
      ],
    });
    expect(
      result.diagnostics.map(({ code, severity, message }) => ({
        code,
        severity,
        message,
      })),
    ).toEqual(
      ["alpha", "beta"].map(() => ({
        code: "PH-GQL-SHARED-DEFINITION-MISMATCH",
        severity: "warning",
        message:
          'Gadget is defined one way by "alpha", and another way by "beta". The supergraph can include the subgraphs of only one of these definitions.',
      })),
    );
  });

  it("accepts a shared type that differs only in field order and descriptions", () => {
    expect(
      findings([
        compat(
          "alpha",
          'type Query { a: Gadget } type Gadget { id: ID! "The size." size: Int }',
        ),
        compat(
          "beta",
          "type Query { b: Gadget } type Gadget { size: Int id: ID! }",
        ),
      ]),
    ).toEqual([]);
  });

  it("accepts typed subgraphs whose shared type differs only in field order and descriptions", () => {
    const gadgets = (
      name: string,
      field: string,
      fields: Parameters<typeof ph.object>[1]["fields"],
    ) =>
      class Gadgets extends BaseSubgraph {
        static override readonly subgraphName = name;
        static override getSchema(schema: SchemaBuilder<Gadgets>) {
          return [
            schema.query(field, {
              returns: ph.ref(ph.object("Gadget", { fields })),
              resolve: () => null,
            }),
          ];
        }
      };
    expect(
      findings([
        gadgets("alpha", "a", {
          id: ph.ID({ required: true }),
          size: ph.Int({ description: "The size." }),
        }),
        gadgets("beta", "b", {
          size: ph.Int(),
          id: ph.ID({ required: true }),
        }),
      ]),
    ).toEqual([]);
  });

  it("warns, as schema-first does, that the server refuses a subgraph that redefines a generated type", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      subgraphs: [
        entry(
          compat(
            "ledger",
            "type Query { lastOperation: Operation } type Operation { id: ID }",
          ),
        ),
      ],
    });
    expect(
      result.diagnostics.map(({ code, severity, path, message }) => ({
        code,
        severity,
        path,
        message,
      })),
    ).toEqual([
      {
        code: "PH-SG-GENERATED-TYPE-TAKEN",
        severity: "warning",
        path: ["composition", "ledger"],
        message:
          'Subgraph "ledger" defines Operation, which the document-model schema generates, so the server refuses it.',
      },
    ]);
  });

  it("names the document model that generates a type the subgraph redefines", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [notesWithOperations()],
      subgraphs: [
        entry(
          compat(
            "ledger",
            "type Query { lastNote: Notes } type Notes { id: ID }",
          ),
        ),
      ],
    });
    expect(
      result.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "PH-SG-GENERATED-TYPE-TAKEN",
        'Subgraph "ledger" defines Notes, which document model "Notes" generates, so the server refuses it.',
      ],
    ]);
  });

  it("warns about a taken name before anything else, as the server decides", () => {
    const codes = (sdl: string) =>
      validateSubgraphsForHost({
        profile: "release",
        documentModels: [],
        subgraphs: [entry(compat("system", sdl))],
      }).diagnostics.map(({ code, severity }) => ({ code, severity }));

    const taken = [{ code: "PH-SG-NAME-TAKEN", severity: "warning" }];
    expect(
      codes(
        "type Query { lastOperation: Operation } type Operation { id: ID }",
      ),
    ).toEqual(taken);
    expect(codes("type Query { missing: Missing }")).toEqual(taken);
  });

  it("says nothing about a single subgraph", () => {
    expect(findings([widgets()])).toEqual([]);
  });
});

describe("the document models a schema builds against", () => {
  it("include the core models the host always loads", () => {
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [
        entry(compat("drives", "type Query { firstDrive: DocumentDrive }")),
      ],
    });
    expect(result).toEqual({ completed: true, diagnostics: [] });
  });

  it("include the selected models", () => {
    const Notes = compat("notes", "type Query { firstNote: Notes }");
    const codes = (documentModels: readonly DocumentModelModule[]) =>
      validateSubgraphsForHost({
        profile: "edit",
        documentModels,
        subgraphs: [entry(Notes)],
      }).diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes([notesModel()])).toEqual([]);
    expect(codes([])).toEqual(["PH-SG-SCHEMA-INVALID"]);
  });

  it("include the package's schema-first models", () => {
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      schemaFirstDocumentModels: [notesModel().documentModel.global],
      subgraphs: [entry(compat("latest", "type Query { firstNote: Notes }"))],
    });
    expect(result).toEqual({ completed: true, diagnostics: [] });
  });

  it("leave out a model the server refuses, and say why", () => {
    const systemInfo = defineDocumentModel({
      id: "test/system-info",
      name: "SystemInfo",
      description: "",
      extension: "sys",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        global: {
          schema: ph.object("SystemInfoState", {
            fields: { title: ph.String() },
          }),
          initialValue: { title: null },
        },
        local: { schema: null, initialValue: {} },
      },
    }).finalize({ modules: [] }) as unknown as DocumentModelModule;
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [systemInfo],
      subgraphs: [
        entry(
          compat(
            "system-info-lookup",
            "type Query { systemInfo: SystemInfo_SystemInfoState }",
          ),
        ),
      ],
    });
    expect(
      result.diagnostics.map(({ code, severity, definition, message }) => ({
        code,
        severity,
        definition,
        message,
      })),
    ).toEqual([
      {
        code: "PH-DM-GRAPHQL-REFUSED",
        severity: "warning",
        definition: { kind: "document-model", key: "test/system-info" },
        message:
          'The server refuses document model "SystemInfo": it generates reserved type names: SystemInfo.',
      },
      {
        code: "PH-SG-SCHEMA-INVALID",
        severity: "error",
        definition: undefined,
        message: expect.stringContaining(
          'Unknown type "SystemInfo_SystemInfoState"',
        ),
      },
    ]);
  });

  it("free the name of a model whose own subgraph the server refuses", () => {
    const context = defineDocumentModel({
      id: "test/loop",
      name: "Loop",
      description: "",
      extension: "loop",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        global: {
          schema: ph.object("LoopState", { fields: { title: ph.String() } }),
          initialValue: { title: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const SetInput: ReturnType<typeof ph.input> = ph.input("SetInput", {
      fields: { next: ph.ref(() => SetInput, { required: true }) },
    });
    const edits = context.module("edits", {
      operations: ({ global }) => ({
        set: global({ input: SetInput, reduce() {} }),
      }),
    });
    const loop = context.finalize({
      modules: [edits],
    }) as unknown as DocumentModelModule;
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [loop],
      subgraphs: [entry(compat("loop", "type Query { ping: String }"))],
    });
    expect(
      result.diagnostics.map(({ code, path, message }) => ({
        code,
        path,
        message,
      })),
    ).toEqual([
      {
        code: "PH-DM-GRAPHQL-REFUSED",
        path: ["composition", "Loop"],
        message: expect.stringMatching(
          /^The server refuses the subgraph of document model "Loop": it has an unusable subgraph schema: /,
        ),
      },
    ]);
  });
});

describe("a versioned model", () => {
  function notesFamily() {
    const Tag = ph.object("Tag", { fields: { label: ph.String() } });
    const declaration = {
      id: "test/notes",
      name: "Notes",
      description: "",
      extension: "notes",
      author: { name: "Powerhouse", website: null },
    };
    const v1 = defineDocumentModel({
      ...declaration,
      version: 1,
      specifications: {
        global: {
          schema: ph.object("NotesState", { fields: { title: ph.String() } }),
          initialValue: { title: null },
        },
        local: { schema: null, initialValue: {} },
      },
    }).version({ modules: [] });
    const v2 = defineDocumentModel({
      ...declaration,
      version: 2,
      specifications: {
        global: {
          schema: ph.object("NotesState", {
            fields: { title: ph.String(), tag: ph.ref(Tag) },
          }),
          initialValue: { title: null, tag: null },
        },
        local: { schema: null, initialValue: {} },
      },
    }).version({ modules: [] });
    return defineDocumentModelFamily({
      versions: [v1, v2],
      upgradeManifest: {
        documentType: "test/notes",
        latestVersion: 2,
        supportedVersions: [1, 2],
        upgrades: {
          v2: { toVersion: 2, upgradeReducer: (document) => document },
        },
      },
    });
  }

  it("is validated at its latest version, as the host serves it", () => {
    const family = notesFamily();
    expect(
      validateSubgraphsForHost({
        profile: "edit",
        documentModels: family.modules as unknown as DocumentModelModule[],
        subgraphs: [
          entry(compat("notes-tags", "type Query { latestTag: Notes_Tag }")),
        ],
      }).diagnostics,
    ).toEqual([]);
  });
});

describe("an aborted check", () => {
  it("stops with the abort instead of reporting the subgraphs it did not build", () => {
    expect(() =>
      validateSubgraphsForHost({
        profile: "release",
        documentModels: [],
        subgraphs: [entry(widgets())],
        signal: AbortSignal.abort(),
      }),
    ).toThrow(expect.objectContaining({ name: "AbortError" }));
  });
});

describe("diagnostic sources", () => {
  it("name the file each failing subgraph came from", () => {
    const a = { specifier: "./subgraphs/a.ts", exportPath: ["A"] } as const;
    const b = { specifier: "./subgraphs/b.ts", exportPath: ["B"] } as const;
    const result = validateSubgraphsForHost({
      profile: "edit",
      documentModels: [],
      subgraphs: [
        entry(compat("dup", "type Query { a: Missing }"), a),
        entry(compat("dup", "type Query { a: Missing }"), b),
      ],
    });
    expect(
      result.diagnostics.map(({ code, source }) => ({ code, source })),
    ).toEqual([
      { code: "PH-SG-SCHEMA-INVALID", source: a },
      { code: "PH-SG-SCHEMA-INVALID", source: b },
    ]);
  });
});

describe("package scalars", () => {
  beforeEach(() => {
    forgetReportedScalarBindings();
  });

  const PhoneNumber = defineScalar({
    name: "PhoneNumber",
    description: "An E.164 phone number.",
    representation: "string",
    validator: z.string().regex(/^\+[1-9]\d{1,14}$/),
    zodSource: "z.string().regex(/^\\+[1-9]\\d{1,14}$/)",
  });

  function contacts() {
    const Contact = ph.object("Contact", {
      fields: { phone: PhoneNumber({ required: true }) },
    });
    return class Contacts extends BaseSubgraph {
      static override readonly subgraphName = "contacts";
      static override getSchema(schema: SchemaBuilder<Contacts>) {
        return [
          schema.query("contact", {
            args: { phone: PhoneNumber({ required: true }) },
            returns: ph.ref(Contact),
            resolve: ({ args }) => ({ phone: args.phone }),
          }),
        ];
      }
    };
  }

  it("validate with the coercion instances serve, so nothing is reported unregistered", () => {
    const Subgraph = contacts();
    const logged: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((...parts: unknown[]) => {
        logged.push(parts.map(String).join(" "));
      });
    try {
      expect(
        validateSubgraphsForHost({
          profile: "edit",
          documentModels: [],
          subgraphs: [entry(Subgraph)],
        }),
      ).toEqual({ completed: true, diagnostics: [] });
    } finally {
      spy.mockRestore();
    }
    expect(logged.filter((line) => line.includes("PH-SCALAR"))).toEqual([]);
    const served = servedSubgraph(
      new Subgraph({} as ConstructorParameters<typeof Subgraph>[0]),
    );
    expect(
      Subgraph[SUBGRAPH_PROTOCOL]()
        .describe()
        .scalarDefinitions.map(({ name }) => name),
    ).toEqual(["PhoneNumber"]);
    expect(
      (served.resolvers.PhoneNumber as { name?: unknown } | undefined)?.name,
    ).toBe("PhoneNumber");
  });
});

describe("a subgraph whose schema fails", () => {
  it("takes no part in composition", () => {
    const result = validateSubgraphsForHost({
      profile: "release",
      documentModels: [],
      subgraphs: [
        entry(widgets("alpha")),
        entry(compat("beta", "type Query { widget: Missing }")),
      ],
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-SG-SCHEMA-INVALID",
    ]);
  });
});

describe("checkDefinitions with the host validator", () => {
  const SUBGRAPHS = "./subgraphs/index.ts" as const;

  function check(
    documentModels: LoadedDefinitionSet["documentModels"],
    classes: Readonly<Record<string, unknown>>,
  ) {
    const { subgraphs, diagnostics } = readSubgraphEntries([
      { specifier: SUBGRAPHS, namespace: classes },
    ]);
    const set: LoadedDefinitionSet = {
      status: "ready",
      packageRoot: "/package",
      sourceSet: {
        mode: "code-first",
        origin: "request",
        digest: `sha256:${"0".repeat(64)}`,
        sources: [],
      },
      diagnostics,
      upgradeManifests: [],
      scalars: [],
      documentModels,
      subgraphs,
    };
    return checkDefinitions({
      profile: "edit",
      loader: {
        normalizeDefinitionSources: () => Promise.resolve(set),
      } as unknown as DefinitionSourceLoader,
      packageRevision: `sha256:${"0".repeat(64)}`,
      hostValidation: validateSubgraphsForHost,
    });
  }

  it("validates a subgraph against the selected and core models", async () => {
    const report = await check(
      [
        {
          source: { specifier: "./document-models/notes.ts" },
          path: [],
          value: notesModel(),
        },
      ],
      {
        Report: compat(
          "report",
          "type Query { firstNote: Notes, firstDrive: DocumentDrive }",
        ),
      },
    );
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    expect(report.definitions.map(({ kind, key }) => [kind, key])).toEqual([
      ["document-model", "test/notes"],
      ["subgraph", "report"],
    ]);
  });

  it("refuses two classes that declare one subgraph name", async () => {
    class FirstLedger extends sdlBase("type Query { a: String }") {
      static override readonly subgraphName = "ledger";
    }
    class SecondLedger extends sdlBase("type Query { b: String }") {
      static override readonly subgraphName = "ledger";
    }
    const report = await check([], { FirstLedger, SecondLedger });
    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics.map(({ code, message, source }) => ({
        code,
        message,
        source,
      })),
    ).toEqual([
      {
        code: "PH-PKG-LOGICAL-COLLISION",
        message:
          "SecondLedger and FirstLedger both declare subgraph ledger, so a host serving this package would keep only one of them.",
        source: { specifier: SUBGRAPHS, exportPath: ["SecondLedger"] },
      },
    ]);
  });

  it("reports what compiling the declaration found, with its source", async () => {
    const Post = ph.object("Post", {
      fields: {
        id: ph.OID({ required: true }),
        wordCount: ph.field({ returns: ph.Int({ required: true }) }),
      },
    });
    class Posts extends BaseSubgraph {
      static override readonly subgraphName = "posts";
      static override getSchema(schema: SchemaBuilder<Posts>) {
        return [
          schema.query("post", {
            returns: ph.ref(Post, { required: true }),
            resolve: () => ({ id: "p" }),
          }),
        ];
      }
    }
    const report = await check([], { Posts });
    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics.map(({ code, message, source }) => ({
        code,
        message,
        source,
      })),
    ).toEqual([
      {
        code: "PH-SG-COMPUTED-FIELD-INVALID",
        message: "Computed field Post.wordCount has no binding.",
        source: { specifier: SUBGRAPHS, exportPath: ["Posts"] },
      },
    ]);
  });

  it("reports compile diagnostics it cannot read instead of passing", async () => {
    class Posts extends BaseSubgraph {
      static override readonly subgraphName = "posts";
      static override getSchema(schema: SchemaBuilder<Posts>) {
        return [
          schema.query("post", { returns: ph.String(), resolve: () => "p" }),
        ];
      }
    }
    const protocol = Posts[SUBGRAPH_PROTOCOL]();
    class NewerPosts extends Posts {
      static override readonly subgraphName = "posts";
      static override [SUBGRAPH_PROTOCOL]() {
        return {
          ...protocol,
          describe: () => ({
            ...protocol.describe(),
            diagnostics: [
              {
                code: "PH-SG-NOT-IN-THIS-RELEASE",
                path: [],
                message: "A code a newer compiler added.",
                repair: "Upgrade.",
              },
            ],
          }),
        } as unknown as ReturnType<(typeof Posts)[typeof SUBGRAPH_PROTOCOL]>;
      }
    }
    const report = await check([], { NewerPosts });
    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics.map(({ code, message }) => [code, message]),
    ).toEqual([
      [
        "PH-SG-DEFINITION-INVALID",
        "NewerPosts's compile diagnostics could not be read.",
      ],
    ]);
  });

  it("builds without a model the adapter rejected", async () => {
    const report = await check(
      [
        {
          source: { specifier: "./document-models/broken.ts" },
          path: [],
          value: {
            reducer: () => undefined,
            documentModel: {},
          } as unknown as DocumentModelModule,
        },
      ],
      { Report: compat("report", "type Query { firstDrive: DocumentDrive }") },
    );
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-DM-DECLARATION-INVALID",
      "PH-DM-DECLARATION-INVALID",
      "PH-DM-DECLARATION-INVALID",
    ]);
  });
});
