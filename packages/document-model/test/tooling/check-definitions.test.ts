import type { DefinitionSource } from "@powerhousedao/shared/clis";
import { vi } from "vitest";
import { defineDocumentModel, ph } from "../../index.js";
import {
  checkDefinitions,
  inspectDefinitions,
  inspectScalarDefinition,
  type DefinitionSourceLoadResult,
} from "../../src/tooling/index.js";

const source = (specifier: `./${string}`): DefinitionSource => ({ specifier });
const digest = `sha256:${"a".repeat(64)}` as `sha256:${string}`;

function loadResult(
  values: DefinitionSourceLoadResult["values"],
  diagnostics: DefinitionSourceLoadResult["diagnostics"] = [],
): DefinitionSourceLoadResult {
  return {
    status: diagnostics.length ? "failed" : "ready",
    sourceSet: {
      mode: "code-first",
      origin: "request",
      digest,
      sources: values.map(({ source: entry }) => entry),
    },
    diagnostics,
    values,
  };
}

function makeCounterModule() {
  const counter = defineDocumentModel({
    id: "test/check-counter",
    name: "Check Counter",
    description: "Definition checker fixture",
    extension: "counter",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("CheckCounterState", {
          fields: { count: ph.Int({ required: true }) },
        }),
        initialValue: { count: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const operations = counter.module("counter", {
    operations: ({ global }) => ({
      setCount: global({
        input: ph.input({ fields: { count: ph.Int({ required: true }) } }),
        reduce(state, input) {
          state.count = input.count;
        },
      }),
    }),
  });
  return counter.finalize({ modules: [operations] });
}

describe("checkDefinitions", () => {
  it("normalizes namespace and collection aliases once", async () => {
    const module = makeCounterModule();
    const selected = source("./src/models.ts");
    const report = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        {
          source: selected,
          value: { CheckCounter: module, documentModels: [module] },
        },
      ]),
    });

    expect(report.status).toBe("ok");
    expect(report.definitions).toHaveLength(1);
    expect(report.definitions[0]).toMatchObject({
      kind: "document-model",
      key: "test/check-counter",
      version: 1,
      source: selected,
    });
    expect(report.definitions[0]?.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.summary).toEqual({ errors: 0, warnings: 0 });
  });

  it("reports distinct values with one logical model key", async () => {
    const first = makeCounterModule();
    const second = makeCounterModule();
    const report = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        { source: source("./src/a.ts"), value: first },
        { source: source("./src/b.ts"), value: second },
      ]),
    });

    expect(report.status).toBe("invalid");
    expect(report.definitions).toHaveLength(2);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-PKG-LOGICAL-COLLISION",
        source: source("./src/b.ts"),
      }),
    ]);
  });

  it("distinguishes definition failures from import failures", async () => {
    const selected = source("./src/broken.ts");
    const definitionFailure = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult(
        [],
        [
          {
            code: "PH-DM-STATE-ROOT-INVALID",
            severity: "error",
            phase: "definition",
            source: selected,
            path: ["specifications", "global", "schema"],
            message: "Wrong root",
            repair: "Declare the canonical root.",
          },
        ],
      ),
    });
    const importFailure = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult(
        [],
        [
          {
            code: "PH-IMPORT-FAILED",
            severity: "error",
            phase: "import",
            source: selected,
            path: [],
            message: "Import failed",
            repair: "Fix the import.",
          },
        ],
      ),
    });

    expect(definitionFailure.status).toBe("invalid");
    expect(importFailure.status).toBe("failed");
  });

  it("rejects public scalar declarations and unrecognized selections", async () => {
    const scalarReport = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        {
          source: source("./src/scalar.ts"),
          value: {
            kind: "powerhouse.scalar",
            formatVersion: 1,
            name: "Custom",
          },
        },
      ]),
    });
    const unknownReport = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        { source: source("./src/empty.ts"), value: { answer: 42 } },
      ]),
    });

    expect(scalarReport.status).toBe("invalid");
    expect(scalarReport.diagnostics[0]?.code).toBe(
      "PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED",
    );
    expect(unknownReport.status).toBe("invalid");
    expect(unknownReport.diagnostics[0]?.code).toBe(
      "PH-PKG-DEFINITION-UNRECOGNIZED",
    );
  });

  it("rejects forged subgraph definitions and reconstructed families", async () => {
    const forgedSubgraph = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        {
          source: source("./src/subgraph.ts"),
          value: {
            definition: {
              kind: "powerhouse.subgraph",
              formatVersion: 1,
              name: "forged",
              schemaKind: "typed",
            },
          },
        },
      ]),
    });
    const reconstructedFamily = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        {
          source: source("./src/family.ts"),
          value: {
            modules: [makeCounterModule()],
            upgradeManifest: {
              documentType: "wrong/family",
              latestVersion: 99,
              supportedVersions: [99],
              upgrades: {},
            },
            at() {
              return undefined;
            },
          },
        },
      ]),
    });

    expect(forgedSubgraph.status).toBe("invalid");
    expect(forgedSubgraph.diagnostics[0]?.code).toBe(
      "PH-GQL-DEFINITION-INVALID",
    );
    expect(reconstructedFamily.status).toBe("invalid");
    expect(reconstructedFamily.diagnostics[0]?.code).toBe(
      "PH-DM-FAMILY-INVALID",
    );

    const crossPackageWireDefinition = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        {
          source: source("./src/valid-subgraph.ts"),
          value: {
            definition: {
              kind: "powerhouse.subgraph",
              formatVersion: 1,
              name: "cross-package",
              compositionPolicy: "host-current",
              federationProfile: "host-current",
              schemaKind: "typed",
              hasSubscriptions: false,
              types: [],
              entries: [],
              scalars: [],
            },
          },
        },
      ]),
    });
    expect(crossPackageWireDefinition.status).toBe("invalid");
    expect(crossPackageWireDefinition.diagnostics[0]?.code).toBe(
      "PH-GQL-PROFILE-VALIDATOR-MISSING",
    );

    const unresolvedReference = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        {
          source: source("./src/unresolved-subgraph.ts"),
          value: {
            definition: {
              kind: "powerhouse.subgraph",
              formatVersion: 1,
              name: "unresolved",
              compositionPolicy: "host-current",
              federationProfile: "host-current",
              schemaKind: "typed",
              hasSubscriptions: false,
              types: [
                {
                  kind: "object",
                  name: "Result",
                  description: null,
                  fields: [
                    {
                      key: "missing",
                      name: "missing",
                      description: null,
                      deprecated: null,
                      type: { kind: "named", name: "Missing", required: false },
                    },
                  ],
                },
              ],
              entries: [],
              scalars: [],
            },
          },
        },
      ]),
    });
    expect(unresolvedReference.status).toBe("invalid");
    expect(unresolvedReference.diagnostics[0]?.code).toBe(
      "PH-GQL-DEFINITION-INVALID",
    );
  });

  it("requires and awaits the host-owned subgraph profile checks", async () => {
    const selected = source("./src/valid-subgraph.ts");
    const request = {
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        {
          source: selected,
          value: {
            definition: {
              kind: "powerhouse.subgraph",
              formatVersion: 1,
              name: "cross-package",
              compositionPolicy: "host-current",
              federationProfile: "host-current",
              schemaKind: "typed",
              hasSubscriptions: false,
              types: [],
              entries: [],
              scalars: [],
            },
          },
        },
      ]),
    } as const;
    const calls: string[] = [];

    const report = await checkDefinitions(request, {
      subgraphProfileValidator: async (profileRequest) => {
        await Promise.resolve();
        calls.push(
          `${profileRequest.profile}:${profileRequest.artifacts[0]?.key}`,
        );
        return [];
      },
    });

    expect(calls).toEqual(["edit:cross-package"]);
    expect(report.status).toBe("ok");

    const failed = await checkDefinitions(request, {
      subgraphProfileValidator: () => Promise.reject(new Error("host details")),
    });
    expect(failed.status).toBe("failed");
    expect(failed.diagnostics[0]?.code).toBe(
      "PH-GQL-PROFILE-VALIDATION-FAILED",
    );
    expect(JSON.stringify(failed)).not.toContain("host details");
  });

  it("reports PH-COMP-1 ownership and shared-definition findings as warnings", async () => {
    const makeSubgraph = (name: string, enumValue: string) => ({
      definition: {
        kind: "powerhouse.subgraph" as const,
        formatVersion: 1 as const,
        name,
        compositionPolicy: "host-current" as const,
        federationProfile: "host-current" as const,
        schemaKind: "typed" as const,
        hasSubscriptions: false,
        types: [
          {
            kind: "enum" as const,
            name: "SharedStatus",
            description: null,
            values: [
              {
                name: enumValue,
                description: null,
                deprecated: null,
              },
            ],
          },
          {
            kind: "object" as const,
            name: "SharedRecord",
            description: null,
            fields: [
              {
                key: "id",
                name: "id",
                description: null,
                deprecated: null,
                type: {
                  kind: "scalar" as const,
                  name: "ID" as const,
                  required: true,
                },
              },
            ],
          },
        ],
        entries: [],
        scalars: [],
      },
    });
    const request = {
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        { source: source("./src/a.ts"), value: makeSubgraph("a", "OPEN") },
        { source: source("./src/b.ts"), value: makeSubgraph("b", "CLOSED") },
      ]),
    } as const;
    const options = {
      subgraphProfileValidator: () => Promise.resolve([]),
    };

    const report = await checkDefinitions(request, options);

    expect(report.status).toBe("ok");
    expect(report.summary).toEqual({ errors: 0, warnings: 2 });
    expect(report.diagnostics.map(({ code }) => code)).toEqual([
      "PH-GQL-SHARED-DEFINITION-MISMATCH",
      "PH-GQL-COORDINATE-OWNED",
    ]);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-GQL-SHARED-DEFINITION-MISMATCH",
        severity: "warning",
        phase: "composition",
        source: source("./src/b.ts"),
        path: ["types", 0],
        related: [expect.objectContaining({ source: source("./src/a.ts") })],
      }),
      expect.objectContaining({
        code: "PH-GQL-COORDINATE-OWNED",
        severity: "warning",
        phase: "composition",
        source: source("./src/b.ts"),
        path: ["types", 1, "fields", 0],
        related: [expect.objectContaining({ source: source("./src/a.ts") })],
      }),
    ]);

    const strict = await checkDefinitions(
      { ...request, warningsAsErrors: true },
      options,
    );
    expect(strict.status).toBe("invalid");
    expect(strict.summary).toEqual({ errors: 0, warnings: 2 });
  });

  it("reports traversal traps instead of escaping the checker", async () => {
    const trapped = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("private traversal details");
        },
      },
    );
    const selected = source("./src/trapped.ts");

    const report = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([{ source: selected, value: trapped }]),
    });

    expect(report.status).toBe("invalid");
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-PKG-DEFINITION-INVALID",
        phase: "package",
        source: selected,
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain("private traversal details");

    const getter = vi.fn(() => makeCounterModule());
    const collection = {};
    Object.defineProperty(collection, "model", {
      enumerable: true,
      get: getter,
    });
    const getterReport = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        { source: source("./src/getter.ts"), value: collection },
      ]),
    });
    expect(getterReport.diagnostics[0]?.code).toBe("PH-PKG-DEFINITION-INVALID");
    expect(getter).not.toHaveBeenCalled();

    const reduce = vi.fn();
    const array: unknown[] = [];
    Object.defineProperty(array, "reduce", {
      enumerable: true,
      value: reduce,
    });
    const arrayReport = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: loadResult([
        { source: source("./src/array.ts"), value: array },
      ]),
    });
    expect(arrayReport.diagnostics[0]?.code).toBe("PH-PKG-DEFINITION-INVALID");
    expect(reduce).not.toHaveBeenCalled();
  });

  it("returns the closed explicit-legacy skipped report", async () => {
    const report = await checkDefinitions({
      formatVersion: 1,
      profile: "edit",
      loadResult: {
        status: "skipped",
        sourceSet: {
          mode: "legacy",
          origin: "config",
          digest,
          sources: [],
        },
        diagnostics: [],
        values: [],
      },
    });
    expect(report).toMatchObject({
      status: "skipped",
      skipReason: "explicit-legacy-mode",
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
    });
  });

  it("inspects the exact normalized definition selected by logical identity", () => {
    const module = makeCounterModule();
    const selected = source("./src/model.ts");
    const report = inspectDefinitions({
      formatVersion: 1,
      profile: "edit",
      compilerVersion: "test",
      selection: {
        kind: "document-model",
        key: "test/check-counter",
        version: 1,
      },
      loadResult: loadResult([{ source: selected, value: module }]),
    });

    expect(report.status).toBe("ok");
    if (report.status !== "ok") throw new Error("Expected inspection result");
    expect(report.source).toEqual(selected);
    expect(report.definition).toEqual(module.definition);
    expect(report.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("reports missing inspection targets without inventing a source", () => {
    const module = makeCounterModule();
    const report = inspectDefinitions({
      formatVersion: 1,
      profile: "edit",
      compilerVersion: "test",
      selection: {
        kind: "document-model",
        key: "test/missing",
        version: 1,
      },
      loadResult: loadResult([
        { source: source("./src/model.ts"), value: module },
      ]),
    });

    expect(report.status).toBe("invalid");
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: "PH-INSPECT-DEFINITION-NOT-FOUND",
      }),
    ]);
    expect(report.diagnostics[0]).not.toHaveProperty("source");
  });

  it("inspects scalar vectors, acceptance digests, and coercion source", () => {
    const report = inspectScalarDefinition("Amount", "test");

    expect(report.status).toBe("ok");
    if (report.status !== "ok") throw new Error("Expected scalar inspection");
    expect(report.definition.name).toBe("Amount");
    expect(report.definition.vector.acceptanceDigest).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(report.definition.vector.accepts.length).toBeGreaterThan(0);
    expect(report.coercionSource).toBe("explicit");
  });
});
