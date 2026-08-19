import {
  ManifestSchema,
  type DocumentModelLib,
  type DocumentModelModule,
} from "document-model";
import { describe, expect, it } from "vitest";
import {
  packageFromDocumentModels,
  resolveDocumentModelModule,
  StaticPackageManager,
} from "../../src/graphql-client/static-package-manager.js";

// Minimal stand-ins with the members the manager actually reads: the document
// type id and the version (`version ?? 1` is the registry's default, mirrored
// by `load`).
function makeModule(id: string, version?: number): DocumentModelModule {
  return {
    version,
    reducer: (document: unknown) => document,
    actions: {},
    utils: {},
    documentModel: { global: { id }, local: {} },
  } as unknown as DocumentModelModule;
}

const todoV1 = makeModule("test/todo", 1);
const todoV2 = makeModule("test/todo", 2);
const unversioned = makeModule("test/legacy");

function makeLib(
  name: string,
  documentModels: DocumentModelModule[],
): DocumentModelLib {
  return {
    manifest: { name },
    documentModels,
    editors: [],
  };
}

describe("StaticPackageManager", () => {
  it("stores the given packages exactly as given", () => {
    const lib = makeLib("real-package", [todoV2]);
    const manager = new StaticPackageManager([lib]);

    expect(manager.packages).toHaveLength(1);
    expect(manager.packages[0]).toBe(lib);
    expect(manager.packages[0].manifest).toBe(lib.manifest);
  });

  it("loads the LATEST version of a type, like the registry", async () => {
    const manager = new StaticPackageManager([
      makeLib("versioned", [todoV1, todoV2]),
    ]);

    await expect(manager.load("test/todo")).resolves.toBe(todoV2);
  });

  it("resolves across packages and defaults an absent version to 1", async () => {
    const manager = new StaticPackageManager([
      makeLib("one", [unversioned]),
      makeLib("two", [todoV1]),
    ]);

    await expect(manager.load("test/legacy")).resolves.toBe(unversioned);
    await expect(manager.load("test/todo")).resolves.toBe(todoV1);
  });

  it("rejects a load for a type it was not given", async () => {
    const manager = new StaticPackageManager([makeLib("one", [todoV2])]);

    await expect(manager.load("test/unknown")).rejects.toThrow(
      "Unknown document type: test/unknown",
    );
  });

  it("returns a working no-op unsubscribe from subscribe", () => {
    const manager = new StaticPackageManager([makeLib("one", [todoV2])]);

    const unsubscribe = manager.subscribe(() => undefined);
    expect(unsubscribe).toBeTypeOf("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("throws from every mutating member", () => {
    const lib = makeLib("one", [todoV2]);
    const manager = new StaticPackageManager([lib]);

    expect(() => manager.addPackage("some-package")).toThrow(
      "addPackage is not supported",
    );
    expect(() => manager.addPackages(["some-package"])).toThrow(
      "addPackages is not supported",
    );
    expect(() => manager.removePackage("some-package")).toThrow(
      "removePackage is not supported",
    );
    expect(() => manager.updateLocalPackage(lib)).toThrow(
      "updateLocalPackage is not supported",
    );
    expect(() => manager.addLocalPackage("some-package", lib)).toThrow(
      "addLocalPackage is not supported",
    );
  });

  it("answers the read-only members with empty values", () => {
    const manager = new StaticPackageManager([makeLib("one", [todoV2])]);

    expect(manager.registryUrl).toBeNull();
    expect(manager.getPackageSource("some-package")).toBeNull();
    expect(manager.getPackageVersion("some-package")).toBeUndefined();
    expect(manager.getRegistryPackages()).toEqual([]);
  });
});

describe("resolveDocumentModelModule", () => {
  const modules = [todoV1, todoV2, unversioned];

  it("returns the EXACT version when one is asked for", () => {
    expect(resolveDocumentModelModule(modules, "test/todo", 1)).toBe(todoV1);
    expect(resolveDocumentModelModule(modules, "test/todo", 2)).toBe(todoV2);
  });

  it("treats an absent module version as 1 when matching exactly", () => {
    expect(resolveDocumentModelModule(modules, "test/legacy", 1)).toBe(
      unversioned,
    );
  });

  it("returns the LATEST version when none is asked for", () => {
    expect(resolveDocumentModelModule(modules, "test/todo")).toBe(todoV2);
  });

  it("never falls back to another version when an exact one is missing", () => {
    // The whole point of the exact rule: v3 is absent, so this must throw
    // rather than silently sign with the v2 reducer.
    expect(() => resolveDocumentModelModule(modules, "test/todo", 3)).toThrow(
      "Unknown document model version: test/todo v3",
    );
  });

  it("names the versions it does have when the exact one is missing", () => {
    expect(() => resolveDocumentModelModule(modules, "test/todo", 3)).toThrow(
      "available: 1, 2",
    );
  });

  it("reports an unknown type for a versioned lookup too", () => {
    expect(() =>
      resolveDocumentModelModule(modules, "test/unknown", 1),
    ).toThrow("Unknown document model version: test/unknown v1");
  });

  it("reports an unknown type for an unversioned lookup", () => {
    expect(() => resolveDocumentModelModule(modules, "test/unknown")).toThrow(
      "Unknown document type: test/unknown",
    );
  });

  it("resolves nothing from an empty module list", () => {
    expect(() => resolveDocumentModelModule([], "test/todo")).toThrow(
      "Unknown document type: test/todo",
    );
  });
});

describe("packageFromDocumentModels", () => {
  it("wraps hand-picked modules in one synthetic package", () => {
    const lib = packageFromDocumentModels([todoV2]);

    expect(lib.documentModels).toEqual([todoV2]);
    expect(lib.editors).toEqual([]);
  });

  it("fabricates a manifest that satisfies the Manifest schema", () => {
    const lib = packageFromDocumentModels([todoV2]);

    // The manifest is only typed on the runtime path, so this parse is what
    // pins its shape against future ManifestSchema drift.
    expect(() => ManifestSchema.parse(lib.manifest)).not.toThrow();
  });
});
