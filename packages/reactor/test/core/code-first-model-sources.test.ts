import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  materializeLoaderPackage,
  type MaterializedPackage,
} from "../../../document-model/test/fixtures/loaders/materialize.js";
import { resolveModelSources } from "../../src/core/model-sources.js";
import { defaultLoadFactory } from "../../src/executor/worker/load-spec.js";

/**
 * A worker thread re-imports each model by file path and export name, because
 * closures cannot cross `postMessage`. A package that stopped exporting each
 * version at the top level would resolve on the host and fail in the worker.
 */

const DOCUMENT_TYPE = "test/ledger";

function withFixture<T>(run: (fixture: MaterializedPackage) => Promise<T>) {
  return async (): Promise<T> => {
    const fixture = materializeLoaderPackage();
    try {
      return await run(fixture);
    } finally {
      fixture.dispose();
    }
  };
}

function modelSubpath(root: string): string {
  return join(root, "document-models", "index.ts");
}

describe("reactor worker pool", () => {
  it(
    "records a named reference for every version it scans",
    withFixture(async (fixture) => {
      const resolved = await resolveModelSources([
        { filePath: modelSubpath(fixture.root) },
      ]);
      expect(
        resolved.manifest.map((entry) => [
          entry.documentType,
          entry.version,
          "exportName" in entry.spec.module
            ? entry.spec.module.exportName
            : null,
        ]),
      ).toEqual([
        [DOCUMENT_TYPE, "1", "ledgerV1"],
        [DOCUMENT_TYPE, "2", "ledgerV2"],
      ]);
      // Every version can be re-imported by a worker, so no key is reachable
      // only as a live module.
      expect(resolved.moduleOnlyKeys).toEqual([]);
    }),
  );

  it(
    "resolves a model by its recorded export name",
    withFixture(async (fixture) => {
      const resolved = await resolveModelSources([
        { filePath: modelSubpath(fixture.root) },
      ]);
      const loaded = [];
      for (const entry of resolved.manifest) {
        const module = (await defaultLoadFactory(entry.spec)) as {
          documentModel: { global: { id: string } };
          version?: number;
        };
        loaded.push([
          entry.version,
          module.documentModel.global.id,
          module.version ?? 1,
        ]);
      }
      expect(loaded).toEqual([
        ["1", DOCUMENT_TYPE, 1],
        ["2", DOCUMENT_TYPE, 2],
      ]);
    }),
  );

  it(
    "accepts an explicitly named export and rejects one that is not a module",
    withFixture(async (fixture) => {
      const explicit = await resolveModelSources([
        { filePath: modelSubpath(fixture.root), exportName: "ledgerV2" },
      ]);
      expect(explicit.modules).toHaveLength(1);
      expect(explicit.modules[0].version).toBe(2);

      // `manifest` is a plain object in the same namespace; naming it is an
      // error rather than a silent empty result.
      await expect(
        resolveModelSources([
          { filePath: modelSubpath(fixture.root), exportName: "manifest" },
        ]),
      ).rejects.toThrow(/is not a DocumentModelModule/);
    }),
  );

  it(
    "observes the same thing for the schema-first package",
    withFixture(async (fixture) => {
      const codeFirst = await resolveModelSources([
        { filePath: modelSubpath(fixture.root) },
      ]);
      const schemaFirst = await resolveModelSources([
        { filePath: modelSubpath(fixture.schemaFirstRoot) },
      ]);
      const shape = (resolved: typeof codeFirst) =>
        resolved.manifest.map((entry) => ({
          documentType: entry.documentType,
          version: entry.version,
          exportName:
            "exportName" in entry.spec.module
              ? entry.spec.module.exportName
              : null,
        }));
      const actions = (resolved: typeof codeFirst) =>
        resolved.modules.map((module) =>
          Object.keys(
            (module as unknown as { actions: Record<string, unknown> }).actions,
          ).sort(),
        );
      const expectedShape = [
        { documentType: DOCUMENT_TYPE, version: "1", exportName: "ledgerV1" },
        { documentType: DOCUMENT_TYPE, version: "2", exportName: "ledgerV2" },
      ];
      expect(shape(codeFirst)).toEqual(expectedShape);
      expect(shape(schemaFirst)).toEqual(expectedShape);
      expect(actions(codeFirst)).toEqual(actions(schemaFirst));
      expect(actions(codeFirst)[1]).toContain("setCurrency");
    }),
  );
});
