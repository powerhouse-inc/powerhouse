import type { DocumentModelModule } from "document-model";

/**
 * Registry for managing document model modules.
 * Provides centralized access to document models' reducers, utils, and specifications.
 */
export interface IDocumentModelRegistry {
  /**
   * Register multiple modules at once.
   *
   * @param modules Document model modules to register
   * @throws Error if a module with the same document type is already registered
   */
  registerModules(...modules: DocumentModelModule[]): void;

  /**
   * Unregister multiple document model modules at once.
   *
   * @param documentTypes The document types to unregister
   * @returns true if all modules were unregistered, false if any were not found
   */
  unregisterModules(...documentTypes: string[]): boolean;

  /**
   * Get a specific document model module by document type.
   *
   * @param documentType The document type identifier
   * @returns The document model module
   * @throws Error if the document type is not registered
   */
  getModule(documentType: string): DocumentModelModule;

  /**
   * Get all registered document model modules
   * @returns Array of all registered modules
   */
  getAllModules(): DocumentModelModule[];

  /**
   * Clear all registered modules
   */
  clear(): void;
}
