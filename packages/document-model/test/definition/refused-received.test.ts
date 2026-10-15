import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { parse } from "graphql";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/adapters/code-first-document-model-source-adapter.js";
import { schemaFirstSpecification } from "../../src/definition/compatibility.js";
import {
  DefinitionDiagnosticCollector,
  DocumentModelDefinitionError,
} from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
} from "../../src/definition/model.js";
import { defineScalar } from "../../src/definition/scalars/define-scalar.js";
import { compileSubgraph } from "../../src/definition/subgraph/definer.js";
import { adaptSchemaFirstDocumentModelModule } from "../../src/definition/tooling/adapters/schema-first-document-model-module-adapter.js";
import { schemaFirstGraphQLDocument } from "../../src/definition/tooling/graphql-document.js";
import { checkDocumentModelDefinitionShape } from "../../src/definition/wire-shape.js";

const SOURCE = { specifier: "./model.ts" } as const;

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

function receivedAt(
  diagnostics: readonly DefinitionDiagnostic[],
  path: string,
): string | undefined {
  return diagnostics.find((entry) => entry.path.join(".") === path)?.received;
}

const state = () =>
  ph.object("SampleState", {
    fields: { title: ph.String({ required: true }) },
  });

function config(overrides: Record<string, unknown> = {}) {
  return {
    id: "test/sample",
    name: "Sample",
    description: "",
    extension: "sample",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: { schema: state(), initialValue: { title: "" } },
      local: { schema: null, initialValue: {} },
    },
    ...overrides,
  } as never;
}

function specifications(global: Record<string, unknown>, extra = {}) {
  return {
    ...extra,
    global: { schema: state(), initialValue: { title: "" }, ...global },
    local: { schema: null, initialValue: {} },
  };
}

/** Every site that refuses an author value, keyed by the path it reports. */
function refusals(value: unknown): Record<string, string | undefined> {
  const declaration = diagnosticsOf(() =>
    defineDocumentModel(
      config({
        id: value,
        name: value,
        description: value,
        extension: value,
        version: value,
        author: { name: value },
      }),
    ),
  );
  const model = defineDocumentModel(config());
  const versionAt = (version: number) =>
    defineDocumentModel(config({ version })).version({ modules: [] });
  const family = diagnosticsOf(() =>
    defineDocumentModelFamily({
      versions: [versionAt(1), versionAt(2)],
      upgradeManifest: {
        documentType: "test/sample",
        latestVersion: 2,
        supportedVersions: [1, 2],
        upgrades: { v2: { toVersion: 2, upgradeReducer: value } },
      },
    } as never),
  );
  const module = adaptCodeFirstDocumentModelSource(
    {
      reducer: value,
      version: value,
      documentModel: { global: { id: value } },
    },
    SOURCE,
  ).diagnostics;

  return {
    id: receivedAt(declaration, "id"),
    name: receivedAt(declaration, "name"),
    description: receivedAt(declaration, "description"),
    extension: receivedAt(declaration, "extension"),
    version: receivedAt(declaration, "version"),
    "author.name": receivedAt(declaration, "author.name"),
    "specifications.global.schema": receivedAt(
      diagnosticsOf(() =>
        defineDocumentModel(
          config({ specifications: specifications({ schema: value }) }),
        ),
      ),
      "specifications.global.schema",
    ),
    "specifications.global.examples.0.value": receivedAt(
      diagnosticsOf(() =>
        defineDocumentModel(
          config({
            specifications: specifications({
              examples: [{ key: "first", value }],
            }),
          }),
        ),
      ),
      "specifications.global.examples.0.value",
    ),
    "specifications.graphQLCompatibility.document": receivedAt(
      diagnosticsOf(() =>
        defineDocumentModel(
          config({
            specifications: specifications(
              {},
              {
                graphQLCompatibility: {
                  kind: "graphql-ast-v1",
                  preserveDefinitionOrder: true,
                  document: value,
                },
              },
            ),
          }),
        ).finalize({ modules: [] }),
      ),
      "specifications.graphQLCompatibility.document",
    ),
    "module.operations": receivedAt(
      diagnosticsOf(() => model.module("m", { operations: value as never })),
      "module.operations",
    ),
    "operations.input": receivedAt(
      diagnosticsOf(() =>
        model.module("m", {
          operations: ({ global }) => ({
            op: global({ input: value, reduce() {} } as never),
          }),
        }),
      ),
      "operations.input",
    ),
    "operations.reduce": receivedAt(
      diagnosticsOf(() =>
        model.module("m", {
          operations: ({ global }) => ({
            op: global({
              input: ph.input({ fields: {} }),
              reduce: value,
            } as never),
          }),
        }),
      ),
      "operations.reduce",
    ),
    "upgradeManifest.upgrades.v2.upgradeReducer": receivedAt(
      family,
      "upgradeManifest.upgrades.v2.upgradeReducer",
    ),
    "names.module/editing.storedName": receivedAt(
      diagnosticsOf(() =>
        schemaFirstSpecification({
          names: { "module/editing": { storedName: value } },
        } as never),
      ),
      "names.module/editing.storedName",
    ),
    "scalar name": receivedAt(
      diagnosticsOf(() =>
        defineScalar({
          name: value,
          builderName: "Thing",
          representation: "string",
        } as never),
      ),
      "name",
    ),
    "ph.ref target": receivedAt(
      diagnosticsOf(() => ph.ref(value as never)),
      "target",
    ),
    "ph.union member": receivedAt(
      diagnosticsOf(() => ph.union("U", { members: [value as never] })),
      "options.members.0",
    ),
    "module reducer": receivedAt(module, "reducer"),
    "module version": receivedAt(module, "version"),
    "module documentModel.global.id": receivedAt(
      module,
      "documentModel.global.id",
    ),
    "family upgradeManifest": receivedAt(
      adaptCodeFirstDocumentModelSource(
        { modules: [], at() {}, upgradeManifest: value },
        SOURCE,
      ).diagnostics,
      "upgradeManifest",
    ),
  };
}

describe("a refused author value", () => {
  it("reads as null wherever null is refused", () => {
    const sites = refusals(null);
    expect(sites).toEqual(
      Object.fromEntries(Object.keys(sites).map((key) => [key, "null"])),
    );
  });

  it("reads as array wherever an array is refused", () => {
    const sites = refusals([]);
    expect(sites).toEqual(
      Object.fromEntries(Object.keys(sites).map((key) => [key, "array"])),
    );
  });

  it("reads as null or array where only one of them is refused", () => {
    const versionAt = (version: number) =>
      defineDocumentModel(config({ version })).version({ modules: [] });
    const family = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [versionAt(1), versionAt(2)],
        upgradeManifest: {
          documentType: "test/sample",
          latestVersion: 2,
          supportedVersions: null,
          upgrades: {},
        },
      } as never),
    );
    const website = diagnosticsOf(() =>
      defineDocumentModel(
        config({ author: { name: "Powerhouse", website: [] } }),
      ),
    );
    const stored = adaptSchemaFirstDocumentModelModule(
      {
        documentModel: { global: { id: "test/sample", specifications: null } },
      },
      SOURCE,
    ).diagnostics;

    expect([
      receivedAt(family, "upgradeManifest.supportedVersions"),
      receivedAt(stored, "documentModel.global.specifications"),
      receivedAt(website, "author.website"),
    ]).toEqual(["null", "null", "array"]);
  });
});

describe("a hand-edited wire definition", () => {
  it("reads an array as array, and an uninspectable value as inspection-failed", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const receivedFor = (value: unknown, path: string) => {
      const collector = new DefinitionDiagnosticCollector();
      checkDocumentModelDefinitionShape(collector, value);
      return receivedAt(collector.diagnostics, path);
    };

    expect([
      receivedFor([], ""),
      receivedFor({ compatibility: [] }, "compatibility"),
      receivedFor(proxy, ""),
    ]).toEqual(["array", "array", "inspection-failed"]);
  });
});

describe("a value refused where a record belongs", () => {
  it("reads as the value's type, not the snapshot's reason", () => {
    const refusedAt = (run: () => unknown) =>
      diagnosticsOf(run).map(({ path, received }) => [
        path.join("."),
        received,
      ]);

    expect([
      ...refusedAt(() => ph.String(null as never)),
      ...refusedAt(() => ph.String({ required: null as never })),
      ...refusedAt(() => ph.String(new Date(0) as never)),
      ...refusedAt(() => ph.object("A", [] as never)),
      ...refusedAt(() => ph.object("A", { fields: null as never })),
      ...refusedAt(() => ph.object("A", { fields: [] as never })),
      ...refusedAt(() => defineScalar(null as never)),
      ...refusedAt(() => defineScalar([] as never)),
      ...refusedAt(() => defineDocumentModel(null as never)),
      ...refusedAt(() => defineDocumentModel([] as never)),
    ]).toEqual([
      ["options", "null"],
      ["options.required", "null"],
      ["options", "object"],
      ["options", "array"],
      ["options.fields", "null"],
      ["options.fields", "array"],
      ["", "null"],
      ["", "array"],
      ["", "null"],
      ["", "array"],
    ]);
  });
});

describe("a refusal built from a snapshot rejection", () => {
  it("describes the value at the rejection's path, not the root", () => {
    const Probe = defineScalar({
      name: "Probe",
      description: "A probe scalar.",
      representation: "string",
      validator: z.string(),
      zodSource: "z.string()",
    });
    const wire = JSON.parse(
      JSON.stringify(
        defineDocumentModel(
          config({
            specifications: {
              global: {
                schema: ph.object("SampleState", { fields: { p: Probe() } }),
                initialValue: { p: null },
              },
              local: { schema: null, initialValue: {} },
            },
          }),
        ).finalize({ modules: [] }).definition,
      ),
    ) as {
      readonly specifications: readonly {
        readonly scalars: readonly { readonly definition: object }[];
      }[];
    };
    Object.defineProperty(
      wire.specifications[0].scalars[0].definition,
      "zero",
      {
        get: () => ({ kind: "none", reason: "none" }),
        enumerable: true,
      },
    );
    const wireChecked = (value: unknown) => {
      const collector = new DefinitionDiagnosticCollector();
      checkDocumentModelDefinitionShape(collector, value);
      return collector.diagnostics;
    };
    const firstRefusal = (diagnostics: readonly DefinitionDiagnostic[]) => {
      const [first] = diagnostics;
      return [first.path.join("."), first.received];
    };

    expect([
      firstRefusal(
        diagnosticsOf(() =>
          schemaFirstSpecification({
            ids: { "module/a": Symbol("s") },
          } as never),
        ),
      ),
      firstRefusal(
        diagnosticsOf(() =>
          schemaFirstSpecification({
            serialization: {
              get "state/global/schema"() {
                return "";
              },
            },
          }),
        ),
      ),
      firstRefusal(
        diagnosticsOf(() =>
          schemaFirstSpecification({
            names: { "module/a": { storedName: [Symbol("s")] } },
          } as never),
        ),
      ),
      firstRefusal(
        adaptCodeFirstDocumentModelSource(
          {
            get reducer() {
              return () => undefined;
            },
          },
          SOURCE,
        ).diagnostics,
      ),
      firstRefusal(
        adaptCodeFirstDocumentModelSource(
          {
            modules: [],
            at() {},
            upgradeManifest: {
              get documentType() {
                return "test/sample";
              },
            },
          },
          SOURCE,
        ).diagnostics,
      ),
      firstRefusal(
        adaptSchemaFirstDocumentModelModule(
          {
            get documentModel() {
              return {};
            },
          },
          SOURCE,
        ).diagnostics,
      ),
      firstRefusal(
        wireChecked({
          get kind() {
            return "powerhouse.document-model";
          },
        }),
      ),
      firstRefusal(wireChecked(wire)),
    ]).toEqual([
      ["ids.module/a", "symbol"],
      ["serialization.state/global/schema", "accessor"],
      ["names.module/a.storedName.0", "symbol"],
      ["reducer", "accessor"],
      ["upgradeManifest.documentType", "accessor"],
      ["documentModel", "accessor"],
      ["kind", "accessor"],
      ["specifications.0.scalars.0.definition.zero", "accessor"],
    ]);
  });

  it("names an array of another prototype or realm where an array belongs, and says how to copy it", () => {
    class Sub extends Array {}

    expect(
      [
        () => ph.union("U", { members: new Sub() as never }),
        () => ph.union("U", { members: runInNewContext("[]") as never }),
        () => ph.enum("E", { values: new Sub() as never }),
        () =>
          ph.object("O", {
            fields: { title: ph.String() },
            implements: new Sub() as never,
          }),
        () =>
          compileSubgraph({
            name: "s",
            schemaKind: "typed",
            entries: () => new Sub() as never,
          }),
        () =>
          defineDocumentModel(
            config({
              specifications: {
                ...specifications({}),
                auxiliaryTypes: new Sub(),
              },
            }),
          ),
      ].flatMap((run) =>
        diagnosticsOf(run).map(({ code, path, message, received, repair }) => [
          code,
          path.join("."),
          message,
          received,
          repair,
        ]),
      ),
    ).toEqual([
      [
        "PH-DEF-UNION-MEMBERS-INVALID",
        "options.members",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Pass members as a nonempty array of descriptors returned by ph.object. Copy an Array subclass or an array from another realm with Array.from(...).",
      ],
      [
        "PH-DEF-UNION-MEMBERS-INVALID",
        "options.members",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Pass members as a nonempty array of descriptors returned by ph.object. Copy an Array subclass or an array from another realm with Array.from(...).",
      ],
      [
        "PH-DEF-ENUM-VALUES-INVALID",
        "options.values",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Pass values as a nonempty array of strings or { name, description?, deprecated? } entries. Copy an Array subclass or an array from another realm with Array.from(...).",
      ],
      [
        "PH-DEF-IMPLEMENTS-INVALID",
        "options.implements",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Pass implements as an array of descriptors returned by ph.interface. Copy an Array subclass or an array from another realm with Array.from(...).",
      ],
      [
        "PH-SG-ENTRY-INVALID",
        "entries",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Return an array of the entries the builders produced. Copy an Array subclass or an array from another realm with Array.from(...).",
      ],
      [
        "PH-DM-DECLARATION-INVALID",
        "specifications.auxiliaryTypes",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Pass an array literal, or copy the array with Array.from(...).",
      ],
    ]);
  });
});

describe("an array of another prototype or realm where fields belong", () => {
  it("is refused as an array, and a revoked proxy is refused rather than thrown", () => {
    class Sub extends Array {}
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(
      [new Sub(), runInNewContext("[]") as unknown, proxy].flatMap((fields) =>
        diagnosticsOf(() => ph.object("A", { fields: fields as never })).map(
          ({ code, message, received }) => [code, message, received],
        ),
      ),
    ).toEqual([
      [
        "PH-DEF-OPTION-INVALID",
        "The option value could not be snapshotted (not-record).",
        "array",
      ],
      [
        "PH-DEF-OPTION-INVALID",
        "The option value could not be snapshotted (not-record).",
        "array",
      ],
      [
        "PH-DEF-OPTION-INVALID",
        "The option value could not be snapshotted (inspection-failed).",
        "inspection-failed",
      ],
    ]);
  });
});

function revokedProxy(): object {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
}

describe("a declaration that cannot be inspected", () => {
  it("is refused by defineScalar with a diagnostic, without running author code", () => {
    let ran = false;
    const refusal = (input: unknown) =>
      diagnosticsOf(() => defineScalar(input as never)).map(
        ({ code, path, definition, received }) => [
          code,
          path.join("."),
          definition?.key ?? null,
          received,
        ],
      );

    expect([
      ...refusal(null),
      ...refusal(5),
      ...refusal(revokedProxy()),
      ...refusal({
        get name() {
          ran = true;
          return "Thing";
        },
      }),
      ...refusal({ name: Object.create(null) as unknown, bogus: 1 }),
      ...refusal({ name: "Thing", bogus: 1 }),
      ...refusal({
        name: Object.create(null) as unknown,
        description: "A thing.",
        representation: "string",
      }),
    ]).toEqual([
      ["PH-SCALAR-DECLARATION-INVALID", "", null, "null"],
      ["PH-SCALAR-DECLARATION-INVALID", "", null, "number"],
      ["PH-SCALAR-DECLARATION-INVALID", "", null, "inspection-failed"],
      ["PH-SCALAR-DECLARATION-INVALID", "name", null, "accessor"],
      ["PH-SCALAR-DECLARATION-INVALID", "bogus", null, "unknown-key"],
      ["PH-SCALAR-DECLARATION-INVALID", "bogus", "Thing", "unknown-key"],
      ["PH-SCALAR-DECLARATION-INVALID", "name", null, "object"],
    ]);
    expect(ran).toBe(false);
  });

  it("is refused by defineDocumentModel with a diagnostic", () => {
    const local = (initialValue: unknown) =>
      config({
        specifications: {
          global: { schema: state(), initialValue: { title: "" } },
          local: { schema: null, initialValue },
        },
      });
    const refusal = (input: unknown) =>
      diagnosticsOf(() => defineDocumentModel(input as never)).map(
        ({ code, path, received }) => [code, path.join("."), received],
      );
    const initialValue = "specifications.local.initialValue";

    expect([
      ...refusal(revokedProxy()),
      ...refusal(config({ specifications: revokedProxy() })),
      ...refusal(local(revokedProxy())),
      ...refusal(local(null)),
      ...refusal(local([])),
      ...refusal(local(0)),
      ...refusal(local({ note: null })),
      ...refusal(local(Object.create({ note: null }))),
      ...refusal(local(Object.create(null))),
    ]).toEqual([
      ["PH-DM-DECLARATION-INVALID", "", "inspection-failed"],
      ["PH-DM-DECLARATION-INVALID", "specifications", "inspection-failed"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "inspection-failed"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "null"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "array"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "number"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "a nonempty object"],
      [
        "PH-DM-INITIAL-VALUE-INVALID",
        initialValue,
        "an object whose prototype is not Object.prototype",
      ],
      [
        "PH-DM-INITIAL-VALUE-INVALID",
        initialValue,
        "an object whose prototype is not Object.prototype",
      ],
    ]);
  });
});

describe("a legitimate declaration", () => {
  it("still declares with plain objects, plain arrays, frozen objects, and undefined members", () => {
    const Probe = defineScalar(
      Object.freeze({
        name: "Probe",
        description: "A probe scalar.",
        representation: "string",
        validator: z.string(),
        zodSource: "z.string()",
        builderName: undefined,
      }),
    );
    const model = defineDocumentModel(
      Object.freeze(
        config({
          changeLog: ["first"],
          author: Object.freeze({ name: "Powerhouse", website: undefined }),
          specifications: Object.freeze({
            global: Object.freeze({
              schema: ph.object("SampleState", {
                fields: Object.freeze({
                  title: Probe(),
                  tags: ph.list(ph.String()),
                }),
              }),
              initialValue: { title: null, tags: [] },
              examples: [Object.freeze({ key: "first", value: "{}" })],
            }),
            local: Object.freeze({
              schema: null,
              initialValue: Object.freeze({}),
            }),
          }),
        }),
      ),
    ).finalize({ modules: [] });
    const compatibility = schemaFirstSpecification(
      Object.freeze({
        ids: Object.freeze({ "module/editing": "stored-id" }),
        names: undefined,
      }),
    );

    expect([
      model.definition.model.documentType,
      model.definition.specifications.map(({ version, scalars }) => [
        version,
        scalars.map(({ name }) => name),
      ]),
      [...compatibility.ids],
    ]).toEqual([
      "test/sample",
      [[1, ["Probe"]]],
      [["module/editing", "stored-id"]],
    ]);
  });
});

describe("a refused member that is null, an array, or has no string form", () => {
  it("reads as null, array, or its type at every remaining site", () => {
    const versionAt = (version: number) =>
      defineDocumentModel(config({ version })).version({ modules: [] });
    const family = (manifest: Record<string, unknown>) => () =>
      defineDocumentModelFamily({
        versions: [versionAt(1), versionAt(2)],
        upgradeManifest: {
          documentType: "test/sample",
          latestVersion: 2,
          supportedVersions: [1, 2],
          upgrades: { v2: { toVersion: 2, upgradeReducer: () => undefined } },
          ...manifest,
        },
      } as never);
    const scalar = (representation: unknown) => () =>
      defineScalar({
        name: "Thing",
        description: "A thing.",
        representation,
      } as never);
    const graphQLCompatibility = (value: unknown) => () =>
      defineDocumentModel(
        config({
          specifications: specifications({}, { graphQLCompatibility: value }),
        }),
      ).finalize({ modules: [] });
    const subgraph = (preserveDefinitionOrder: unknown) => () =>
      compileSubgraph({
        name: "compat",
        schemaKind: "graphql-ast-compat",
        compatibility: {
          kind: "graphql-ast-v1",
          typeDefs: parse("type Query { ping: String }"),
          resolverCoordinates: [
            { typeName: "Query", fieldName: "ping", resolverKind: "field" },
          ],
          getResolvers: () => ({ Query: { ping: () => "pong" } }),
          hasSubscriptions: undefined,
          preserveDefinitionOrder,
        },
      } as never);
    const refusal = (run: () => unknown) => {
      try {
        const [first] = diagnosticsOf(run);
        return [first.path.join("."), first.received];
      } catch (error) {
        return ["thrown", String(error)];
      }
    };

    expect([
      refusal(() =>
        schemaFirstSpecification({ ids: { "module/a": null } } as never),
      ),
      refusal(() =>
        schemaFirstSpecification({ ids: { "module/a": [] } } as never),
      ),
      refusal(() =>
        schemaFirstSpecification({
          serialization: { "state/global/schema": null },
        } as never),
      ),
      refusal(() =>
        schemaFirstSpecification({
          serialization: { "state/global/schema": [] },
        } as never),
      ),
      refusal(scalar([])),
      refusal(scalar(Object.create(null))),
      refusal(family({ documentType: [] })),
      refusal(family({ latestVersion: [] })),
      refusal(
        family({
          upgrades: { v2: { toVersion: [], upgradeReducer: () => undefined } },
        }),
      ),
      refusal(
        family({
          upgrades: {
            v2: {
              toVersion: Object.create(null) as unknown,
              upgradeReducer: () => undefined,
            },
          },
        }),
      ),
      refusal(graphQLCompatibility([])),
      refusal(graphQLCompatibility({ kind: Object.create(null) as unknown })),
      refusal(graphQLCompatibility(revokedProxy())),
      refusal(subgraph([])),
      refusal(subgraph(Object.create(null))),
    ]).toEqual([
      ["ids.module/a", "null"],
      ["ids.module/a", "array"],
      ["serialization.state/global/schema", "null"],
      ["serialization.state/global/schema", "array"],
      ["representation", "array"],
      ["representation", "object"],
      ["upgradeManifest.documentType", "array"],
      ["upgradeManifest.latestVersion", "array"],
      ["upgradeManifest.upgrades.v2.toVersion", "array"],
      ["upgradeManifest.upgrades.v2.toVersion", "object"],
      ["specifications.graphQLCompatibility", "array"],
      ["specifications.graphQLCompatibility.kind", "object"],
      ["specifications.graphQLCompatibility", "inspection-failed"],
      ["compatibility.preserveDefinitionOrder", "array"],
      ["compatibility.preserveDefinitionOrder", "object"],
    ]);
  });
});

describe("a stored model whose parent is not a record", () => {
  const storedModels: readonly unknown[] = [
    null,
    [],
    { global: null },
    { global: [] },
    { global: {} },
  ];
  const refusedAt = (diagnostics: readonly DefinitionDiagnostic[]) =>
    diagnostics
      .filter(({ path }) => path[0] === "documentModel")
      .map(({ path, received }) => [path.join("."), received]);

  it("is reported at the parent by the schema-first adapter", () => {
    expect(
      storedModels.map((documentModel) =>
        refusedAt(
          adaptSchemaFirstDocumentModelModule({ documentModel }, SOURCE)
            .diagnostics,
        ),
      ),
    ).toEqual([
      [["documentModel", "null"]],
      [["documentModel", "array"]],
      [["documentModel.global", "null"]],
      [["documentModel.global", "array"]],
      [["documentModel.global.specifications", "undefined"]],
    ]);
  });

  it("is reported at the parent by the code-first adapter", () => {
    expect(
      storedModels.map((documentModel) =>
        refusedAt(
          adaptCodeFirstDocumentModelSource(
            { reducer() {}, version: 1, documentModel },
            SOURCE,
          ).diagnostics,
        ),
      ),
    ).toEqual([
      [["documentModel", "null"]],
      [["documentModel", "array"]],
      [["documentModel.global", "null"]],
      [["documentModel.global", "array"]],
      [["documentModel.global.id", "undefined"]],
    ]);
  });
});

describe("a specifications value that is not the scope map", () => {
  it("is refused once per mistake", () => {
    const withHidden = specifications({});
    Object.defineProperty(withHidden, "custom", {
      value: {},
      enumerable: false,
    });
    const refusal = (value: unknown) =>
      diagnosticsOf(() =>
        defineDocumentModel(config({ specifications: value })),
      ).map(({ code, path, message, received }) => [
        code,
        path.join("."),
        message,
        received,
      ]);
    const scope = (key: string) => [
      "PH-DM-SCOPE-UNSUPPORTED",
      `specifications.${key}`,
      `Scope "${key}" cannot be declared; DocumentSpecification.state describes global and local only.`,
      key,
    ];

    expect([
      refusal([]),
      refusal(new String("ab")),
      refusal(withHidden),
      refusal(specifications({}, { custom: {} })),
      refusal(specifications({}, { auth: {} })),
    ]).toEqual([
      [
        [
          "PH-DM-DECLARATION-INVALID",
          "specifications",
          "The option value could not be snapshotted (not-record).",
          "array",
        ],
      ],
      [
        [
          "PH-DM-DECLARATION-INVALID",
          "specifications",
          "The option value could not be snapshotted (custom-prototype).",
          "object",
        ],
      ],
      [scope("custom")],
      [scope("custom")],
      [
        [
          "PH-AUTH-UNSUPPORTED",
          "specifications.auth",
          "A document model cannot declare authorization; core V1 rejects a model auth declaration.",
          "auth",
        ],
      ],
    ]);
  });
});

describe("a scalar member that cannot be read as data", () => {
  const scalar = (members: Record<string, unknown>) => () =>
    defineScalar({
      name: "Probe",
      description: "A probe scalar.",
      representation: "string",
      validator: z.string(),
      zodSource: "z.string()",
      ...members,
    } as never);
  const coercion = {
    parseValue: String,
    parseLiteral: () => "literal",
    serialize: String,
  };

  it("is refused by defineScalar with a diagnostic, not a raw throw", () => {
    const refusal = (run: () => unknown) => {
      try {
        return diagnosticsOf(run).map(({ code, path, received }) => [
          code,
          path.join("."),
          received,
        ]);
      } catch (error) {
        return [["thrown", String(error)]];
      }
    };

    expect([
      ...refusal(scalar({ validator: revokedProxy() })),
      ...refusal(scalar({ validator: [] })),
      ...refusal(scalar({ coercion: revokedProxy() })),
      ...refusal(
        scalar({
          coercion: {
            ...coercion,
            get parseValue() {
              return String;
            },
          },
        }),
      ),
      ...refusal(scalar({ zero: revokedProxy() })),
      ...refusal(
        scalar({
          zero: {
            get kind() {
              return "value";
            },
            value: "",
          },
        }),
      ),
      ...refusal(
        scalar({ zero: { kind: "value", value: "", reason: Symbol("why") } }),
      ),
      ...refusal(
        scalar({ zero: { kind: "none", reason: "none", value: Symbol("v") } }),
      ),
      ...refusal(scalar({ zero: { kind: "value", value: "", bogus: 1 } })),
    ]).toEqual([
      ["PH-SCALAR-DECLARATION-INVALID", "validator", "inspection-failed"],
      ["PH-SCALAR-DECLARATION-INVALID", "validator", "array"],
      ["PH-SCALAR-DECLARATION-INVALID", "coercion", "inspection-failed"],
      ["PH-SCALAR-DECLARATION-INVALID", "coercion.parseValue", "accessor"],
      ["PH-SCALAR-ZERO-VALUE-INVALID", "zero", "inspection-failed"],
      ["PH-SCALAR-ZERO-VALUE-INVALID", "zero.kind", "accessor"],
      ["PH-SCALAR-ZERO-VALUE-INVALID", "zero.reason", "reason"],
      ["PH-SCALAR-ZERO-VALUE-INVALID", "zero.value", "value"],
      ["PH-SCALAR-ZERO-VALUE-INVALID", "zero.bogus", "unknown-key"],
    ]);
  });

  it("still accepts a plain or frozen zero and coercion", () => {
    const declared = [
      scalar({ zero: { kind: "value", value: "" }, coercion })(),
      scalar({
        zero: Object.freeze({ kind: "none", reason: "No empty probe." }),
        coercion: Object.freeze({ ...coercion }),
      })(),
    ];

    expect(
      declared.map(({ definition, binding }) => [
        definition.zero,
        definition.coercion.source,
        binding.coercion.parseLiteral({ kind: "string", value: "x" }),
      ]),
    ).toEqual([
      [{ kind: "value", value: "" }, "explicit", "literal"],
      [{ kind: "none", reason: "No empty probe." }, "explicit", "literal"],
    ]);
  });
});

describe("a GraphQL compatibility record", () => {
  const finalize = (graphQLCompatibility: unknown) => () =>
    defineDocumentModel(
      config({
        specifications: specifications({}, { graphQLCompatibility }),
      }),
    ).finalize({ modules: [] });
  const compatibility = schemaFirstGraphQLDocument([
    "type SampleState { title: String! }",
  ]);

  it("is read once without running author code, and its refusal describes the faulty member", () => {
    let ran = false;
    const refusal = (value: unknown) => {
      try {
        return diagnosticsOf(finalize(value)).map(
          ({ code, path, received }) => [code, path.join("."), received],
        );
      } catch (error) {
        return [["thrown", String(error)]];
      }
    };

    expect([
      ...refusal({
        ...compatibility,
        get kind() {
          ran = true;
          return "graphql-ast-v1";
        },
      }),
      ...refusal({ ...compatibility, preserveDefinitionOrder: false }),
      ...refusal({ ...compatibility, preserveDefinitionOrder: undefined }),
      ...refusal({ ...compatibility, kind: "graphql-ast-v2" }),
    ]).toEqual([
      [
        "PH-DM-COMPATIBILITY-INVALID",
        "specifications.graphQLCompatibility.kind",
        "accessor",
      ],
      [
        "PH-DM-COMPATIBILITY-INVALID",
        "specifications.graphQLCompatibility.preserveDefinitionOrder",
        "false",
      ],
      [
        "PH-DM-COMPATIBILITY-INVALID",
        "specifications.graphQLCompatibility.preserveDefinitionOrder",
        "undefined",
      ],
      [
        "PH-DM-COMPATIBILITY-INVALID",
        "specifications.graphQLCompatibility.kind",
        "graphql-ast-v2",
      ],
    ]);
    expect(ran).toBe(false);
  });

  it("still accepts the record schemaFirstGraphQLDocument returns, frozen or copied", () => {
    expect(
      [compatibility, Object.freeze({ ...compatibility })].map(
        (value) =>
          finalize(value)().definition.specifications[0]?.graphQLCompatibility
            ?.kind,
      ),
    ).toEqual(["graphql-ast-v1", "graphql-ast-v1"]);
  });
});

describe("a stored model refusal", () => {
  const described = (diagnostics: readonly DefinitionDiagnostic[]) =>
    diagnostics
      .filter(({ path }) => path[0] === "documentModel")
      .map(({ path, message, expected, received, repair }) => [
        path.join("."),
        message,
        expected,
        received,
        repair,
      ]);
  const schemaFirst = (documentModel: unknown) =>
    described(
      adaptSchemaFirstDocumentModelModule({ documentModel }, SOURCE)
        .diagnostics,
    );
  const codeFirst = (documentModel: unknown) =>
    described(
      adaptCodeFirstDocumentModelSource(
        { reducer() {}, version: 1, documentModel },
        SOURCE,
      ).diagnostics,
    );
  const unreadableSpecifications = (member: string) =>
    `A stored document model keeps its specification history in documentModel.global as plain data, and its ${member} cannot be read`;
  const unreadableModule = (member: string) =>
    `A usable document-model module keeps its stored model in documentModel.global as plain data, and its ${member} cannot be read`;
  const plain = (member: string) =>
    `${member} as a plain record of data properties`;

  it("describes the refused parent in the schema-first adapter, and the specifications member once the parent is read", () => {
    const repair =
      "Pass the module produced by ph generate, or its stored state.";

    expect([
      ...schemaFirst(null),
      ...schemaFirst({ global: [] }),
      ...schemaFirst({ global: { specifications: {} } }),
    ]).toEqual([
      [
        "documentModel",
        `${unreadableSpecifications("documentModel")} (not-record).`,
        plain("documentModel"),
        "null",
        repair,
      ],
      [
        "documentModel.global",
        `${unreadableSpecifications("documentModel.global")} (not-record).`,
        plain("documentModel.global"),
        "array",
        repair,
      ],
      [
        "documentModel.global.specifications",
        "A stored document model carries a specification history.",
        "an array of stored specifications",
        "object",
        repair,
      ],
    ]);
  });

  it("describes the refused parent in the code-first adapter, and the stored model ID once the parent is read", () => {
    expect([
      ...codeFirst(null),
      ...codeFirst({ global: [] }),
      ...codeFirst({ global: {} }),
    ]).toEqual([
      [
        "documentModel",
        `${unreadableModule("documentModel")} (not-record).`,
        plain("documentModel"),
        "null",
        "Export the module returned by context.finalize() or family.at(version) without replacing its documentModel.",
      ],
      [
        "documentModel.global",
        `${unreadableModule("documentModel.global")} (not-record).`,
        plain("documentModel.global"),
        "array",
        "Export the module returned by context.finalize() or family.at(version) without replacing its documentModel.",
      ],
      [
        "documentModel.global.id",
        "A usable document-model module has a stored model ID.",
        "a nonempty document type",
        "undefined",
        "Declare id in defineDocumentModel; the stored model ID is the document type every consumer registers.",
      ],
    ]);
  });
});

describe("a refused value that cannot be inspected", () => {
  it("reads as inspection-failed wherever it is described, as it does where it is snapshotted", () => {
    expect([
      receivedAt(
        diagnosticsOf(() =>
          defineDocumentModel(config({ id: revokedProxy() })),
        ),
        "id",
      ),
      receivedAt(
        adaptCodeFirstDocumentModelSource(
          {
            reducer: revokedProxy(),
            version: 1,
            documentModel: { global: { id: "test/sample" } },
          },
          SOURCE,
        ).diagnostics,
        "reducer",
      ),
      receivedAt(
        adaptSchemaFirstDocumentModelModule(
          { documentModel: { global: { specifications: revokedProxy() } } },
          SOURCE,
        ).diagnostics,
        "documentModel.global.specifications",
      ),
      receivedAt(
        diagnosticsOf(() =>
          schemaFirstSpecification({
            ids: { "module/a": revokedProxy() },
          } as never),
        ),
        "ids.module/a",
      ),
    ]).toEqual([
      "inspection-failed",
      "inspection-failed",
      "inspection-failed",
      "inspection-failed",
    ]);
  });

  it("includes an array whose length cannot be read, which is not refused as a non-array", () => {
    const unreadableLength = new Proxy([], {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        return key === "length" ? { ...descriptor, value: -1 } : descriptor;
      },
    });

    expect(
      [
        () => ph.union("U", { members: unreadableLength as never }),
        () =>
          defineDocumentModel(
            config({
              specifications: specifications(
                {},
                { auxiliaryTypes: unreadableLength },
              ),
            }),
          ),
      ].flatMap((run) =>
        diagnosticsOf(run).map(({ code, path, message, received }) => [
          code,
          path.join("."),
          message,
          received,
        ]),
      ),
    ).toEqual([
      [
        "PH-DEF-OPTION-INVALID",
        "options.members",
        "The option value could not be snapshotted (inspection-failed).",
        "inspection-failed",
      ],
      [
        "PH-DM-DECLARATION-INVALID",
        "specifications.auxiliaryTypes",
        "The option value could not be snapshotted (inspection-failed).",
        "inspection-failed",
      ],
    ]);
  });
});

describe("a scalar coercion", () => {
  it("may be any object whose three members are functions, as before", () => {
    class Coercion {
      readonly unit = "ms";
      parseValue(value: unknown): number {
        return Number(value);
      }
      parseLiteral(): number {
        return 0;
      }
      serialize(value: unknown): unknown {
        return value;
      }
    }
    const Duration = defineScalar({
      name: "Duration",
      description: "A duration",
      representation: "number",
      validator: z.number().int(),
      zodSource: "z.number().int()",
      coercion: new Coercion(),
    });

    expect(Duration.binding.coercion.serialize(5)).toBe(5);
    expect(Duration.binding.definition.coercion.source).toBe("explicit");
  });

  it("keeps its instance as the receiver of each member", () => {
    class Offset {
      #offset = 10;
      readonly scale = 2;
      parseValue(value: unknown): number {
        return Number(value) + this.#offset;
      }
      parseLiteral(): number {
        return this.#offset;
      }
      serialize(value: unknown): unknown {
        return Number(value) * this.scale;
      }
    }
    const Shifted = defineScalar({
      name: "Shifted",
      description: "A shifted number",
      representation: "number",
      validator: z.number(),
      zodSource: "z.number()",
      coercion: new Offset(),
    });

    expect(Shifted.binding.coercion.parseValue(2)).toBe(12);
    expect(Shifted.binding.coercion.serialize(3)).toBe(6);
  });

  it("has a validator whose methods are read as data, with no accessor run", () => {
    let ran = false;
    const validator = {
      get parse() {
        ran = true;
        return () => 1;
      },
      safeParse: () => ({ success: true, data: 1 }),
    };
    const refused = diagnosticsOf(() =>
      defineScalar({
        name: "Guarded",
        description: "A guarded validator",
        representation: "number",
        validator: validator as never,
        zodSource: "z.number()",
      }),
    ).map((entry) => [entry.code, entry.path.join("."), entry.received]);

    expect(ran).toBe(false);
    expect(refused).toEqual([
      ["PH-SCALAR-DECLARATION-INVALID", "validator.parse", "accessor"],
    ]);
  });

  it("and a validator report a faulty member at its own path, with what it holds", () => {
    const methods = {
      parseValue: (value: unknown) => value,
      parseLiteral: () => 0,
      serialize: (value: unknown) => value,
    };
    const declare = (members: Record<string, unknown>) =>
      diagnosticsOf(() =>
        defineScalar({
          name: "Membered",
          description: "A membered number",
          representation: "number",
          validator: z.number(),
          zodSource: "z.number()",
          ...members,
        } as never),
      ).map((entry) => [entry.path.join("."), entry.received]);

    expect([
      ...declare({ validator: { parse: 5, safeParse: () => ({}) } }),
      ...declare({ validator: { parse: () => 0 } }),
      ...declare({ coercion: { ...methods, serialize: 5 } }),
      ...declare({ coercion: { parseValue: methods.parseValue } }),
      ...declare({ coercion: [] }),
    ]).toEqual([
      ["validator.parse", "number"],
      ["validator.safeParse", "undefined"],
      ["coercion.serialize", "number"],
      ["coercion.parseLiteral", "undefined"],
      ["coercion", "array"],
    ]);
  });

  it("differs from a zero, which is data and so must be a plain record, not a class instance", () => {
    const scalar = (zero: unknown) => () =>
      defineScalar({
        name: "Zeroed",
        description: "A zeroed number",
        representation: "number",
        validator: z.number(),
        zodSource: "z.number()",
        zero: zero as never,
      });
    const declare = (zero: unknown) =>
      diagnosticsOf(scalar(zero)).map((entry) => [
        entry.code,
        entry.path.join("."),
        entry.received,
      ]);
    const record = Object.assign(Object.create(null) as object, {
      kind: "value",
      value: 0,
    });

    expect(scalar(record)().definition.zero).toEqual({
      kind: "value",
      value: 0,
    });
    expect(
      declare(
        new (class Zero {
          readonly kind = "value";
          readonly value = 0;
        })(),
      ),
    ).toEqual([["PH-SCALAR-ZERO-VALUE-INVALID", "zero", "object"]]);
  });

  it("is refused, not looped over, when its prototype chain never ends", () => {
    const cyclic: object = new Proxy({}, { getPrototypeOf: () => cyclic });
    const endless: ProxyHandler<object> = {
      getPrototypeOf: () => new Proxy({}, endless),
    };
    const declare = (coercion: object) =>
      diagnosticsOf(() =>
        defineScalar({
          name: "Looped",
          description: "A looped coercion",
          representation: "number",
          validator: z.number(),
          zodSource: "z.number()",
          coercion: coercion as never,
        }),
      ).map((entry) => [entry.code, entry.path.join("."), entry.received]);

    expect(declare(cyclic)).toEqual([
      ["PH-SCALAR-DECLARATION-INVALID", "coercion", "inspection-failed"],
    ]);
    expect(declare(new Proxy({}, endless))).toEqual([
      ["PH-SCALAR-DECLARATION-INVALID", "coercion", "inspection-failed"],
    ]);
  });
});
