import type { DocumentModelModule } from "document-model";
import type { IDocumentModelRegistry } from "./interfaces.js";

/**
 * Error thrown when a document model module is not found in the registry.
 */
export class ModuleNotFoundError extends Error {
  constructor(documentType: string) {
    super(`Document model module not found for type: ${documentType}`);
    this.name = "ModuleNotFoundError";
  }
}

/**
 * Error thrown when attempting to register a module that already exists.
 */
export class DuplicateModuleError extends Error {
  constructor(documentType: string) {
    super(`Document model module already registered for type: ${documentType}`);
    this.name = "DuplicateModuleError";
  }
}

/**
 * Error thrown when a module is invalid or malformed.
 */
export class InvalidModuleError extends Error {
  constructor(message: string) {
    super(`Invalid document model module: ${message}`);
    this.name = "InvalidModuleError";
  }
}

/**
 * In-memory implementation of the IDocumentModelRegistry interface.
 * Manages document model modules and provides centralized access to their reducers, utils, and specifications.
 */
export class DocumentModelRegistry implements IDocumentModelRegistry {
  private modules = new Map<string, DocumentModelModule<any>>();

  /**
   * Register multiple modules at once.
   *
   * @param modules Document model modules to register
   * @throws DuplicateModuleError if a module with the same document type is already registered
   * @throws InvalidModuleError if a module is malformed
   */
  registerModules(...modules: DocumentModelModule<any>[]): void {
    for (const module of modules) {
      const documentType = module.documentModel.id;

      if (this.modules.has(documentType)) {
        throw new DuplicateModuleError(documentType);
      }

      this.modules.set(documentType, module);
    }
  }

  /**
   * Unregister multiple document model modules at once.
   *
   * @param documentTypes The document types to unregister
   * @returns true if all modules were unregistered, false if any were not found
   */
  unregisterModules(...documentTypes: string[]): boolean {
    let allFound = true;

    for (const documentType of documentTypes) {
      const wasDeleted = this.modules.delete(documentType);
      if (!wasDeleted) {
        allFound = false;
      }
    }

    return allFound;
  }

  /**
   * Get a specific document model module by document type.
   *
   * @param documentType The document type identifier
   * @returns The document model module
   * @throws ModuleNotFoundError if the document type is not registered
   */
  getModule(documentType: string): DocumentModelModule<any> {
    const module = this.modules.get(documentType);

    if (module) {
      return module;
    }

    throw new ModuleNotFoundError(documentType);
  }

  /**
   * Get all registered document model modules.
   * Note: This only returns loaded modules, not lazy-loaded ones.
   *
   * @returns Array of all registered modules
   */
  getAllModules(): DocumentModelModule<any>[] {
    return Array.from(this.modules.values());
  }

  /**
   * Clear all registered modules
   */
  clear(): void {
    this.modules.clear();
  }
}
