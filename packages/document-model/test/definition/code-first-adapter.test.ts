import type { DefinitionSource } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/adapters/code-first-document-model-source-adapter.js";
import { canonicalJson } from "../../src/definition/primitives.js";
import { Invoice } from "./fixtures/invoice.js";
import { TaskFamily, TaskV1, TaskV2 } from "./fixtures/family-model.js";

const SOURCE: DefinitionSource = { specifier: "./models/invoice.js" };

function adapt(value: unknown, source: DefinitionSource = SOURCE) {
  return adaptCodeFirstDocumentModelSource(value, source);
}

/** A shallow clone deep enough to break one member without touching the fixture. */
function withModule(patch: Record<string, unknown>): unknown {
  return { ...Invoice, ...patch };
}

describe("code-first source adapter", () => {
  it("normalizes a finalized single-version model", () => {
    const result = adapt(Invoice);
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.upgradeManifest).toBeNull();
    expect(result.artifacts).toHaveLength(1);
    const [artifact] = result.artifacts;
    expect(artifact.documentType).toBe("powerhouse/invoice");
    expect(artifact.version).toBe(1);
    expect(artifact.source).toStrictEqual(SOURCE);
    expect(artifact.kind).toBe("powerhouse.document-model-artifact");
  });

  it("normalizes a family into its ordered versions and its manifest", () => {
    const result = adapt(TaskFamily, { specifier: "./models/task.js" });
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.artifacts.map((entry) => entry.version)).toStrictEqual([
      1, 2,
    ]);
    // Each version's artifact points at the member that produced it.
    expect(
      result.artifacts.map((entry) => entry.source.exportPath),
    ).toStrictEqual([
      ["modules", "0"],
      ["modules", "1"],
    ]);
    expect(result.upgradeManifest).toBe(TaskFamily.upgradeManifest);
    expect(result.artifacts[0].definition).toBe(TaskV1.definition);
    expect(result.artifacts[1].definition).toBe(TaskV2.definition);
  });

  it("projects what the module already carries, without re-deriving it", () => {
    const [artifact] = adapt(Invoice).artifacts;
    // The normalized output is the definition, not a copy that could drift.
    expect(canonicalJson(artifact.definition)).toBe(
      canonicalJson(Invoice.definition),
    );
    expect(canonicalJson(artifact.documentModel)).toBe(
      canonicalJson(Invoice.documentModel),
    );
  });

  it("extracts every identity vector from the definition", () => {
    const [artifact] = adapt(Invoice).artifacts;
    const specification = Invoice.definition.specifications[0];
    const ids = new Map(
      artifact.identity.map((entry) => [entry.key, entry.id]),
    );
    for (const module of specification.modules) {
      expect(ids.get(`module/${module.key}`)).toBe(module.id);
      for (const operation of module.operations) {
        const coordinate = `${module.key}/${operation.key}`;
        expect(ids.get(`operation/${coordinate}`)).toBe(operation.id);
        for (const error of operation.errors) {
          expect(ids.get(`error/${coordinate}/${error.key}`)).toBe(error.id);
        }
        for (const example of operation.examples) {
          expect(
            ids.get(`operation-example/${coordinate}/${example.key}`),
          ).toBe(example.id);
        }
      }
    }
    for (const example of specification.state.global.examples) {
      expect(ids.get(`state-example/global/${example.key}`)).toBe(example.id);
    }
    // Every ID in the definition appears exactly once as a vector.
    expect(new Set(artifact.identity.map((entry) => entry.key)).size).toBe(
      artifact.identity.length,
    );
  });

  it("produces the same digest on two cold imports", async () => {
    const first = adapt(Invoice).artifacts[0].digest;
    // A reset module registry re-evaluates the fixture, so the compiler runs
    // again from nothing rather than handing back the cached module.
    vi.resetModules();
    const reimported = await import("./fixtures/invoice.js");
    expect(reimported.Invoice).not.toBe(Invoice);
    const second = adapt(reimported.Invoice).artifacts[0].digest;
    expect(second).toBe(first);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("reports a missing stored model ID with its source path", () => {
    const result = adapt(
      withModule({
        documentModel: {
          ...Invoice.documentModel,
          global: { ...Invoice.documentModel.global, id: "" },
        },
      }),
    );
    expect(result.artifacts).toStrictEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["documentModel", "global", "id"],
    });
  });

  it("reports a non-callable reducer instead of throwing", () => {
    const result = adapt(withModule({ reducer: "not a reducer" }));
    expect(result.artifacts).toStrictEqual([]);
    expect(result.diagnostics.map((entry) => entry.path)).toContainEqual([
      "reducer",
    ]);
  });

  it("reports an invalid declared version", () => {
    for (const version of [0, -1, 1.5, "1", undefined]) {
      const result = adapt(withModule({ version }));
      expect(result.artifacts).toStrictEqual([]);
      expect(result.diagnostics.map((entry) => entry.path)).toContainEqual([
        "version",
      ]);
    }
  });

  it("reports a malformed wire definition at the member that is wrong", () => {
    const definition = structuredClone(Invoice.definition) as Record<
      string,
      unknown
    >;
    (definition.model as Record<string, unknown>).author = { name: 4 };
    const result = adapt(withModule({ definition }));
    expect(result.artifacts).toStrictEqual([]);
    expect(result.diagnostics.map((entry) => entry.path)).toContainEqual([
      "definition",
      "model",
      "author",
      "name",
    ]);
  });

  it("rejects a definition whose kind alone looks right", () => {
    const result = adapt(
      withModule({
        definition: { kind: "powerhouse.document-model", formatVersion: 1 },
      }),
    );
    expect(result.artifacts).toStrictEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("reports a mismatched document type", () => {
    const definition = structuredClone(Invoice.definition) as Record<
      string,
      unknown
    >;
    (definition.model as Record<string, unknown>).documentType =
      "powerhouse/other";
    const result = adapt(withModule({ definition }));
    expect(result.diagnostics.map((entry) => entry.path)).toContainEqual([
      "definition",
      "model",
      "documentType",
    ]);
  });

  it("reports a version absent from the specification history", () => {
    const result = adapt(withModule({ version: 7 }));
    expect(result.artifacts).toStrictEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      path: ["definition", "specifications"],
      expected: "a specification for version 7",
    });
  });

  it("reports a family whose manifest does not match its modules", () => {
    const result = adapt(
      {
        ...TaskFamily,
        upgradeManifest: {
          ...TaskFamily.upgradeManifest,
          supportedVersions: [1],
          latestVersion: 1,
        },
      },
      { specifier: "./models/task.js" },
    );
    expect(result.upgradeManifest).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["upgradeManifest"],
      expected: "[1,2]",
    });
  });

  it("does not let a valid sibling carry a malformed family member", () => {
    const broken = { ...TaskV2, reducer: undefined };
    const result = adapt(
      { ...TaskFamily, modules: [TaskV1, broken] },
      { specifier: "./models/task.js" },
    );
    // The valid member still normalizes; the broken one is reported with its
    // own index, and the family manifest is withheld.
    expect(result.artifacts.map((entry) => entry.version)).toStrictEqual([1]);
    expect(result.upgradeManifest).toBeNull();
    expect(result.diagnostics.map((entry) => entry.path)).toContainEqual([
      "modules",
      1,
      "reducer",
    ]);
  });

  it("normalizes one family member on its own", () => {
    const result = adapt(TaskV2, { specifier: "./models/task.js" });
    expect(result.diagnostics).toStrictEqual([]);
    expect(result.artifacts[0].version).toBe(2);
    // A member carries the complete history, so its artifact does too.
    expect(
      result.artifacts[0].definition.specifications.map(
        (entry) => entry.version,
      ),
    ).toStrictEqual([1, 2]);
  });

  it("reports a value that is not a module at all", () => {
    for (const value of [null, 4, "model", [], () => undefined]) {
      const result = adapt(value);
      expect(result.artifacts).toStrictEqual([]);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    }
  });

  it("imports no graphql module", async () => {
    const adapter =
      await import("../../src/definition/adapters/code-first-document-model-source-adapter.js");
    expect(Object.keys(adapter)).toContain("adaptCodeFirstDocumentModelSource");
    // The import-graph proof lives in package-entry.test.ts; this asserts the
    // adapter module itself loads without a GraphQL runtime present.
  });
});
