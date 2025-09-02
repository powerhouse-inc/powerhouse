import { driveDocumentModelModule } from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
} from "document-model";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DocumentModelRegistry,
  DuplicateModuleError,
  ModuleNotFoundError,
} from "../src/registry/implementation.js";

describe("DocumentModelRegistry", () => {
  let registry: DocumentModelRegistry;

  // Use real document model modules with proper type casting
  const documentModelModule =
    documentModelDocumentModelModule as unknown as DocumentModelModule;
  const driveModule =
    driveDocumentModelModule as unknown as DocumentModelModule;

  beforeEach(() => {
    registry = new DocumentModelRegistry();
  });

  describe("registerModules", () => {
    it("should register a single module successfully", () => {
      expect(() => registry.registerModules(documentModelModule)).not.toThrow();
      expect(registry.getAllModules()).toHaveLength(1);
      expect(registry.getAllModules()[0]).toBe(documentModelModule);
    });

    it("should register multiple modules successfully", () => {
      expect(() =>
        registry.registerModules(documentModelModule, driveModule),
      ).not.toThrow();
      expect(registry.getAllModules()).toHaveLength(2);
      expect(registry.getAllModules()).toContain(documentModelModule);
      expect(registry.getAllModules()).toContain(driveModule);
    });

    it("should throw DuplicateModuleError when registering duplicate module", () => {
      registry.registerModules(documentModelModule);
      expect(() => registry.registerModules(documentModelModule)).toThrow(
        DuplicateModuleError,
      );
      expect(() => registry.registerModules(documentModelModule)).toThrow(
        `Document model module already registered for type: ${documentModelModule.documentModel.id}`,
      );
    });

    it("should allow registering different modules with different IDs", () => {
      registry.registerModules(documentModelModule);
      expect(() => registry.registerModules(driveModule)).not.toThrow();
      expect(registry.getAllModules()).toHaveLength(2);
    });
  });

  describe("getModule", () => {
    it("should return registered module", () => {
      registry.registerModules(documentModelModule);
      const module = registry.getModule(documentModelModule.documentModel.id);
      expect(module).toBe(documentModelModule);
    });

    it("should return correct module when multiple are registered", () => {
      registry.registerModules(documentModelModule, driveModule);

      const docModule = registry.getModule(
        documentModelModule.documentModel.id,
      );
      expect(docModule).toBe(documentModelModule);

      const drvModule = registry.getModule(driveModule.documentModel.id);
      expect(drvModule).toBe(driveModule);
    });

    it("should throw ModuleNotFoundError for unregistered module", () => {
      expect(() => registry.getModule("unknown.module.id")).toThrow(
        ModuleNotFoundError,
      );
      expect(() => registry.getModule("unknown.module.id")).toThrow(
        "Document model module not found for type: unknown.module.id",
      );
    });

    it("should throw ModuleNotFoundError after module is unregistered", () => {
      registry.registerModules(documentModelModule);
      registry.unregisterModules(documentModelModule.documentModel.id);

      expect(() =>
        registry.getModule(documentModelModule.documentModel.id),
      ).toThrow(ModuleNotFoundError);
    });
  });

  describe("unregisterModules", () => {
    it("should unregister a single module successfully", () => {
      registry.registerModules(documentModelModule);
      const result = registry.unregisterModules(
        documentModelModule.documentModel.id,
      );
      expect(result).toBe(true);
      expect(registry.getAllModules()).toHaveLength(0);
    });

    it("should unregister multiple modules successfully", () => {
      registry.registerModules(documentModelModule, driveModule);
      const result = registry.unregisterModules(
        documentModelModule.documentModel.id,
        driveModule.documentModel.id,
      );
      expect(result).toBe(true);
      expect(registry.getAllModules()).toHaveLength(0);
    });

    it("should return false when module not found", () => {
      const result = registry.unregisterModules("unknown.module.id");
      expect(result).toBe(false);
    });

    it("should return false when some modules not found", () => {
      registry.registerModules(documentModelModule);
      const result = registry.unregisterModules(
        documentModelModule.documentModel.id,
        "unknown.module.id",
      );
      expect(result).toBe(false);
      // But the found module should still be unregistered
      expect(registry.getAllModules()).toHaveLength(0);
    });

    it("should only unregister specified modules", () => {
      registry.registerModules(documentModelModule, driveModule);
      const result = registry.unregisterModules(
        documentModelModule.documentModel.id,
      );
      expect(result).toBe(true);
      expect(registry.getAllModules()).toHaveLength(1);
      expect(registry.getAllModules()[0]).toBe(driveModule);
    });
  });

  describe("getAllModules", () => {
    it("should return empty array when no modules registered", () => {
      const modules = registry.getAllModules();
      expect(modules).toEqual([]);
    });

    it("should return all registered modules", () => {
      registry.registerModules(documentModelModule, driveModule);
      const modules = registry.getAllModules();
      expect(modules).toHaveLength(2);
      expect(modules).toContain(documentModelModule);
      expect(modules).toContain(driveModule);
    });

    it("should return modules in registration order", () => {
      registry.registerModules(documentModelModule);
      registry.registerModules(driveModule);
      const modules = registry.getAllModules();
      expect(modules[0]).toBe(documentModelModule);
      expect(modules[1]).toBe(driveModule);
    });
  });

  describe("clear", () => {
    it("should clear all registered modules", () => {
      registry.registerModules(documentModelModule, driveModule);
      registry.clear();
      expect(registry.getAllModules()).toEqual([]);
    });

    it("should allow registering modules after clear", () => {
      registry.registerModules(documentModelModule);
      registry.clear();

      expect(() => registry.registerModules(documentModelModule)).not.toThrow();
      expect(registry.getAllModules()).toHaveLength(1);
    });

    it("should make getModule throw after clear", () => {
      registry.registerModules(documentModelModule);
      const moduleId = documentModelModule.documentModel.id;

      // Module is accessible before clear
      expect(() => registry.getModule(moduleId)).not.toThrow();

      registry.clear();

      // Module is not accessible after clear
      expect(() => registry.getModule(moduleId)).toThrow(ModuleNotFoundError);
    });
  });

  describe("Integration tests", () => {
    it("should handle multiple operations in sequence", () => {
      // Register modules
      registry.registerModules(documentModelModule, driveModule);
      expect(registry.getAllModules()).toHaveLength(2);

      // Get modules
      const docModule = registry.getModule(
        documentModelModule.documentModel.id,
      );
      expect(docModule).toBe(documentModelModule);

      // Unregister one
      registry.unregisterModules(driveModule.documentModel.id);
      expect(registry.getAllModules()).toHaveLength(1);

      // Try to get unregistered module
      expect(() => registry.getModule(driveModule.documentModel.id)).toThrow(
        ModuleNotFoundError,
      );

      // Clear all
      registry.clear();
      expect(registry.getAllModules()).toHaveLength(0);

      // Register again
      registry.registerModules(driveModule);
      expect(registry.getAllModules()).toHaveLength(1);
    });

    it("should maintain consistency after multiple register/unregister cycles", () => {
      // First cycle
      registry.registerModules(documentModelModule);
      expect(registry.getAllModules()).toHaveLength(1);
      registry.unregisterModules(documentModelModule.documentModel.id);
      expect(registry.getAllModules()).toHaveLength(0);

      // Second cycle
      registry.registerModules(documentModelModule, driveModule);
      expect(registry.getAllModules()).toHaveLength(2);
      registry.unregisterModules(documentModelModule.documentModel.id);
      expect(registry.getAllModules()).toHaveLength(1);

      // Third cycle
      registry.registerModules(documentModelModule);
      expect(registry.getAllModules()).toHaveLength(2);
      registry.clear();
      expect(registry.getAllModules()).toHaveLength(0);
    });

    it("should properly handle edge cases", () => {
      // Unregister from empty registry
      expect(registry.unregisterModules("any.id")).toBe(false);

      // Clear empty registry
      expect(() => registry.clear()).not.toThrow();

      // Register, clear, then try to get
      registry.registerModules(documentModelModule);
      registry.clear();
      expect(() =>
        registry.getModule(documentModelModule.documentModel.id),
      ).toThrow(ModuleNotFoundError);
    });
  });
});
