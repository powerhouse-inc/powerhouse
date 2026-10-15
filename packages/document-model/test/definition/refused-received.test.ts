import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
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
import { adaptSchemaFirstDocumentModelModule } from "../../src/definition/tooling/adapters/schema-first-document-model-module-adapter.js";
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
  it("reads an array as array, and an uninspectable value as its type", () => {
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
    ]).toEqual(["array", "array", "object"]);
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
