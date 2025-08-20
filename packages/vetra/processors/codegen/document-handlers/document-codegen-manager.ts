import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { logger } from "../logger.js";
import { type BaseDocumentGen } from "./base-document-gen.js";
import { type Config } from "./types.js";

/**
 * Manager class responsible for routing documents to the correct generator
 * and managing generator registration and instantiation
 */
export class DocumentCodegenManager {
  private generators = new Map<string, BaseDocumentGen>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(private config: Config) {}

  /**
   * Register a generator class for a specific document type
   */
  registerGenerator(
    documentType: string,
    generatorClass: new (config: Config) => BaseDocumentGen,
  ): void {
    if (this.generators.has(documentType)) {
      logger.warn(
        `⚠️ Generator for document type "${documentType}" is already registered. Overwriting.`,
      );
    }

    this.generators.set(documentType, new generatorClass(this.config));
    logger.info(`✅ Registered generator for document type: ${documentType}`);
  }

  /**
   * Register a generator class that supports multiple document types
   */
  registerMultiTypeGenerator(
    generatorClass: new (config: Config) => BaseDocumentGen,
  ): void {
    const generator = new generatorClass(this.config);
    const supportedTypes = generator.getSupportedDocumentTypes();

    for (const documentType of supportedTypes) {
      if (this.generators.has(documentType)) {
        logger.warn(
          `⚠️ Generator for document type "${documentType}" is already registered. Overwriting.`,
        );
      }
      this.generators.set(documentType, generator);
    }

    logger.info(
      `✅ Registered multi-type generator for document types: ${supportedTypes.join(", ")}`,
    );
  }

  /**
   * Get a generator instance for the given document type
   */
  getGenerator(documentType: string): BaseDocumentGen | undefined {
    return this.generators.get(documentType);
  }

  /**
   * Get all registered document types
   */
  getRegisteredDocumentTypes(): string[] {
    return Array.from(this.generators.keys());
  }

  /**
   * Check if a document type is supported
   */
  isDocumentTypeSupported(documentType: string): boolean {
    return this.generators.has(documentType);
  }

  /**
   * Route a document to the appropriate generator and handle the generation
   */
  async routeAndGenerate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const documentType = strand.documentType;

    if (!documentType) {
      logger.error("❌ Document type is missing from strand state");
      throw new Error("Document type is missing from strand state");
    }

    const generator = this.getGenerator(documentType);

    if (!generator) {
      logger.warn(`⚠️ No generator found for document type: ${documentType}`);
      logger.info(
        `ℹ️ Supported document types: ${this.getRegisteredDocumentTypes().join(", ")}`,
      );
      throw new Error(`Unsupported document type: ${documentType}`);
    }

    // Clear any existing debounce timer for this document type
    const existingTimer = this.debounceTimers.get(documentType);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set up new debounced generation
    const debounceTimer = setTimeout(async () => {
      try {
        logger.info(
          `🔄 Routing document type "${documentType}" to generator (debounced)`,
        );
        await generator.generate(strand);
        logger.info(
          `✅ Successfully generated code for document type: ${documentType}`,
        );
      } catch (error) {
        logger.error(
          `❌ Error generating code for document type "${documentType}":`,
          error,
        );
      } finally {
        // Clean up the timer reference
        this.debounceTimers.delete(documentType);
      }
    }, 1000); // 10 second debounce

    // Store the timer reference
    this.debounceTimers.set(documentType, debounceTimer);
  }

  /**
   * Clear all registered generators
   */
  clearGenerators(): void {
    this.generators.clear();
    logger.info("🧹 Cleared all registered generators");
  }

  /**
   * Get statistics about registered generators
   */
  getStats(): { totalGenerators: number; supportedTypes: string[] } {
    return {
      totalGenerators: this.generators.size,
      supportedTypes: this.getRegisteredDocumentTypes(),
    };
  }
}
