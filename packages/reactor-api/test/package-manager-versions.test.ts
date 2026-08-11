import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  getUniqueDocumentModels,
  getUniqueUpgradeManifests,
} from "../src/packages/package-manager.js";
import { extractUpgradeManifests } from "../src/packages/util.js";

function fakeModule(id: string, version?: number): DocumentModelModule {
  return {
    ...(version === undefined ? {} : { version }),
    documentModel: { global: { id } },
    reducer: () => undefined,
    actions: {},
    utils: {},
  } as unknown as DocumentModelModule;
}

describe("getUniqueDocumentModels", () => {
  it("keeps every version of a versioned document type", () => {
    const models = getUniqueDocumentModels([
      fakeModule("test/versioned", 1),
      fakeModule("test/versioned", 2),
    ]);

    expect(models.map((m) => m.version).sort()).toEqual([1, 2]);
  });

  it("dedupes the same (type, version) across lists, last wins", () => {
    const first = fakeModule("test/versioned", 1);
    const second = fakeModule("test/versioned", 1);
    const models = getUniqueDocumentModels([first], [second]);

    expect(models).toHaveLength(1);
    expect(models[0]).toBe(second);
  });

  it("treats an unversioned module as version 1", () => {
    const models = getUniqueDocumentModels([
      fakeModule("test/versioned"),
      fakeModule("test/versioned", 1),
      fakeModule("test/versioned", 2),
    ]);

    expect(models).toHaveLength(2);
    expect(models.map((m) => m.version ?? 1).sort()).toEqual([1, 2]);
  });
});

function fakeManifest(
  documentType: string,
  latestVersion = 2,
): UpgradeManifest<readonly number[]> {
  const upgrades: Record<string, unknown> = {};
  for (let v = 2; v <= latestVersion; v++) {
    upgrades[`v${v}`] = {
      toVersion: v,
      upgradeReducer: (document: unknown) => document,
    };
  }
  return {
    documentType,
    latestVersion,
    supportedVersions: Array.from({ length: latestVersion }, (_, i) => i + 1),
    upgrades,
  } as unknown as UpgradeManifest<readonly number[]>;
}

describe("extractUpgradeManifests", () => {
  it("collects the aggregate upgradeManifests array export", () => {
    const manifest = fakeManifest("test/versioned");
    const namespace = {
      SomeModelV1: fakeModule("test/versioned", 1),
      SomeModelV2: fakeModule("test/versioned", 2),
      upgradeManifests: [manifest],
    };

    expect(extractUpgradeManifests(namespace)).toEqual([manifest]);
  });

  it("collects individual manifest exports and dedupes by documentType", () => {
    const manifest = fakeManifest("test/versioned");
    const namespace = {
      someUpgradeManifest: manifest,
      upgradeManifests: [manifest],
    };

    expect(extractUpgradeManifests(namespace)).toEqual([manifest]);
  });

  it("ignores document model modules and other exports", () => {
    const namespace = {
      SomeModelV1: fakeModule("test/versioned", 1),
      helper: () => undefined,
      constant: 42,
    };

    expect(extractUpgradeManifests(namespace)).toEqual([]);
  });
});

describe("getUniqueUpgradeManifests", () => {
  it("dedupes manifests by documentType across packages, last wins", () => {
    const stale = fakeManifest("test/versioned", 2);
    const fresh = fakeManifest("test/versioned", 3);
    const other = fakeManifest("test/other", 2);

    const manifests = getUniqueUpgradeManifests([stale, other], [fresh]);

    expect(manifests).toHaveLength(2);
    expect(manifests).toContain(fresh);
    expect(manifests).toContain(other);
    expect(manifests).not.toContain(stale);
  });
});
