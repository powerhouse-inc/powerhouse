import { beforeEach, describe, expect, it } from "vitest";
import {
  DocumentModelRegistry,
  DowngradeNotSupportedError,
  DuplicateManifestError,
  DuplicateModuleError,
  InvalidUpgradeStepError,
  ManifestNotFoundError,
  MissingUpgradeTransitionError,
  ModuleNotFoundError,
} from "../../src/registry/implementation.js";
import {
  testDocUpgradeManifest,
  testDocV1Module,
  testDocV2Module,
  testDocV3Module,
  VERSIONED_DOC_TYPE,
} from "../fixtures/versioned-test-doc/index.js";

describe("DocumentModelRegistry - Versioning", () => {
  let registry: DocumentModelRegistry;

  beforeEach(() => {
    registry = new DocumentModelRegistry();
  });

  describe("registerModules with versions", () => {
    it("should register multiple versions of the same document type", () => {
      registry.registerModules(
        testDocV1Module,
        testDocV2Module,
        testDocV3Module,
      );
      expect(registry.getAllModules()).toHaveLength(3);
    });

    it("should throw DuplicateModuleError when registering same type+version", () => {
      registry.registerModules(testDocV1Module);
      expect(() => registry.registerModules(testDocV1Module)).toThrow(
        DuplicateModuleError,
      );
      expect(() => registry.registerModules(testDocV1Module)).toThrow(
        `Document model module already registered for type: ${VERSIONED_DOC_TYPE} (version 1)`,
      );
    });

    it("should default version to 1 when module has no version field", () => {
      const moduleWithoutVersion = { ...testDocV1Module, version: undefined };
      registry.registerModules(moduleWithoutVersion);
      expect(registry.getLatestVersion(VERSIONED_DOC_TYPE)).toBe(1);
    });
  });

  describe("getModule with version", () => {
    beforeEach(() => {
      registry.registerModules(
        testDocV1Module,
        testDocV2Module,
        testDocV3Module,
      );
    });

    it("should return correct module for specific version", () => {
      expect(registry.getModule(VERSIONED_DOC_TYPE, 1)).toBe(testDocV1Module);
      expect(registry.getModule(VERSIONED_DOC_TYPE, 2)).toBe(testDocV2Module);
      expect(registry.getModule(VERSIONED_DOC_TYPE, 3)).toBe(testDocV3Module);
    });

    it("should return latest version when version not specified", () => {
      expect(registry.getModule(VERSIONED_DOC_TYPE)).toBe(testDocV3Module);
    });

    it("should throw ModuleNotFoundError for non-existent version", () => {
      expect(() => registry.getModule(VERSIONED_DOC_TYPE, 99)).toThrow(
        ModuleNotFoundError,
      );
      expect(() => registry.getModule(VERSIONED_DOC_TYPE, 99)).toThrow(
        `Document model module not found for type: ${VERSIONED_DOC_TYPE} version 99`,
      );
    });

    it("should throw ModuleNotFoundError for unknown document type", () => {
      expect(() => registry.getModule("unknown/type")).toThrow(
        ModuleNotFoundError,
      );
    });
  });

  describe("getSupportedVersions", () => {
    it("should return sorted array of versions", () => {
      registry.registerModules(
        testDocV3Module,
        testDocV1Module,
        testDocV2Module,
      );
      expect(registry.getSupportedVersions(VERSIONED_DOC_TYPE)).toEqual([
        1, 2, 3,
      ]);
    });

    it("should throw ModuleNotFoundError for unknown document type", () => {
      expect(() => registry.getSupportedVersions("unknown/type")).toThrow(
        ModuleNotFoundError,
      );
    });
  });

  describe("getLatestVersion", () => {
    it("should return highest version number", () => {
      registry.registerModules(testDocV1Module, testDocV3Module);
      expect(registry.getLatestVersion(VERSIONED_DOC_TYPE)).toBe(3);
    });

    it("should throw ModuleNotFoundError for unknown document type", () => {
      expect(() => registry.getLatestVersion("unknown/type")).toThrow(
        ModuleNotFoundError,
      );
    });
  });

  describe("registerUpgradeManifests", () => {
    it("should register upgrade manifest", () => {
      registry.registerUpgradeManifests(testDocUpgradeManifest);
      expect(registry.getUpgradeManifest(VERSIONED_DOC_TYPE)).toBe(
        testDocUpgradeManifest,
      );
    });

    it("should throw DuplicateManifestError for duplicate", () => {
      registry.registerUpgradeManifests(testDocUpgradeManifest);
      expect(() =>
        registry.registerUpgradeManifests(testDocUpgradeManifest),
      ).toThrow(DuplicateManifestError);
    });
  });

  describe("getUpgradeManifest", () => {
    it("should return manifest for document type", () => {
      registry.registerUpgradeManifests(testDocUpgradeManifest);
      expect(registry.getUpgradeManifest(VERSIONED_DOC_TYPE)).toBe(
        testDocUpgradeManifest,
      );
    });

    it("should throw ManifestNotFoundError for unknown document type", () => {
      expect(() => registry.getUpgradeManifest("unknown/type")).toThrow(
        "Upgrade manifest not found for type: unknown/type",
      );
    });
  });

  describe("computeUpgradePath", () => {
    beforeEach(() => {
      registry.registerUpgradeManifests(testDocUpgradeManifest);
    });

    it("should return empty array for same version", () => {
      expect(registry.computeUpgradePath(VERSIONED_DOC_TYPE, 1, 1)).toEqual([]);
    });

    it("should return single transition for v1 to v2", () => {
      const path = registry.computeUpgradePath(VERSIONED_DOC_TYPE, 1, 2);
      expect(path).toHaveLength(1);
      expect(path[0].toVersion).toBe(2);
    });

    it("should return multiple transitions for v1 to v3", () => {
      const path = registry.computeUpgradePath(VERSIONED_DOC_TYPE, 1, 3);
      expect(path).toHaveLength(2);
      expect(path[0].toVersion).toBe(2);
      expect(path[1].toVersion).toBe(3);
    });

    it("should throw DowngradeNotSupportedError for downgrade", () => {
      expect(() =>
        registry.computeUpgradePath(VERSIONED_DOC_TYPE, 3, 1),
      ).toThrow(DowngradeNotSupportedError);
    });

    it("should throw ManifestNotFoundError for unknown type", () => {
      expect(() => registry.computeUpgradePath("unknown/type", 1, 2)).toThrow(
        ManifestNotFoundError,
      );
    });

    it("should throw MissingUpgradeTransitionError for missing transition", () => {
      const incompleteManifest = {
        ...testDocUpgradeManifest,
        upgrades: { v2: testDocUpgradeManifest.upgrades.v2 },
      };
      registry.clear();
      registry.registerUpgradeManifests(
        incompleteManifest as typeof testDocUpgradeManifest,
      );
      expect(() =>
        registry.computeUpgradePath(VERSIONED_DOC_TYPE, 1, 3),
      ).toThrow(MissingUpgradeTransitionError);
    });
  });

  describe("getUpgradeReducer", () => {
    beforeEach(() => {
      registry.registerUpgradeManifests(testDocUpgradeManifest);
    });

    it("should return upgrade reducer for valid transition", () => {
      const reducer = registry.getUpgradeReducer(VERSIONED_DOC_TYPE, 1, 2);
      expect(reducer).toBe(testDocUpgradeManifest.upgrades.v2.upgradeReducer);
    });

    it("should throw InvalidUpgradeStepError for non-single-step", () => {
      expect(() =>
        registry.getUpgradeReducer(VERSIONED_DOC_TYPE, 1, 3),
      ).toThrow(InvalidUpgradeStepError);
    });

    it("should throw ManifestNotFoundError for unknown type", () => {
      expect(() => registry.getUpgradeReducer("unknown/type", 1, 2)).toThrow(
        ManifestNotFoundError,
      );
    });
  });

  describe("backward compatibility", () => {
    it("should work with modules without version field (defaults to 1)", () => {
      const moduleWithoutVersion = { ...testDocV1Module, version: undefined };
      registry.registerModules(moduleWithoutVersion);

      const retrieved = registry.getModule(VERSIONED_DOC_TYPE);
      expect(retrieved).toBe(moduleWithoutVersion);
      expect(registry.getLatestVersion(VERSIONED_DOC_TYPE)).toBe(1);
    });

    it("should return latest when getModule called without version", () => {
      registry.registerModules(testDocV1Module, testDocV2Module);
      expect(registry.getModule(VERSIONED_DOC_TYPE)).toBe(testDocV2Module);
    });
  });

  describe("clear with manifests", () => {
    it("should clear both modules and manifests", () => {
      registry.registerModules(testDocV1Module);
      registry.registerUpgradeManifests(testDocUpgradeManifest);

      registry.clear();

      expect(registry.getAllModules()).toHaveLength(0);
      expect(() => registry.getUpgradeManifest(VERSIONED_DOC_TYPE)).toThrow(
        `Upgrade manifest not found for type: ${VERSIONED_DOC_TYPE}`,
      );
    });
  });

  describe("unregisterModules with versions", () => {
    it("should unregister all versions of a document type", () => {
      registry.registerModules(
        testDocV1Module,
        testDocV2Module,
        testDocV3Module,
      );
      expect(registry.getAllModules()).toHaveLength(3);

      registry.unregisterModules(VERSIONED_DOC_TYPE);

      expect(registry.getAllModules()).toHaveLength(0);
    });
  });
});
