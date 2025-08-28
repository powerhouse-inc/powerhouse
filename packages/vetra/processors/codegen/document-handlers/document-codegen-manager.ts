import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import {
  InteractiveManager,
  type QueuedStrand,
} from "../interactive-manager.js";
import { logger } from "../logger.js";
import { type BaseDocumentGen } from "./base-document-gen.js";
import { type Config } from "./types.js";

const DEFAULT_DEBOUNCE_TIME = 1000; // 1 second

/**
 * Manager class responsible for routing documents to the correct generator
 * and managing generator registration and instantiation
 */
export class DocumentCodegenManager {
  private generators = new Map<string, BaseDocumentGen>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private interactiveManager: InteractiveManager;

  constructor(
    private config: Config,
    interactiveMode: boolean = false,
  ) {
    this.interactiveManager = new InteractiveManager(interactiveMode);
  }

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
   * Public method to allow external access for validation
   */
  public getGenerator(documentType: string): BaseDocumentGen | undefined {
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
   * Handles both interactive and non-interactive modes with queue-based processing
   */
  async routeAndGenerate(strand: InternalTransmitterUpdate): Promise<void> {
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

    // Validate if this strand should be processed
    if (!generator.shouldProcess(strand)) {
      logger.debug(
        `>>> Generator validation failed for ${documentType}:${strand.documentId}, skipping processing`,
      );
      return;
    }

    // Different flow for interactive vs non-interactive mode
    if (this.interactiveManager.isInteractive()) {
      // Interactive mode: queue strands and use debounce timer to trigger batch processing
      logger.debug(
        `>>> Queueing strand for interactive processing: ${documentType}:${strand.documentId}`,
      );

      // Add strand to queue (will replace any existing strand for same document)
      this.interactiveManager.queueStrand(strand);

      // Clear any existing debounce timer for interactive processing
      const existingTimer = this.debounceTimers.get("interactive");
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set up debounce timer for batch interactive processing
      const debounceTimer = setTimeout(async () => {
        try {
          await this.interactiveManager.processQueueWithConfirmation(
            async (queuedStrands: QueuedStrand[]) => {
              await this.processQueuedStrands(queuedStrands);
            },
          );
        } catch (error) {
          logger.error("❌ Error during interactive batch processing:", error);
        } finally {
          // Clean up the timer reference
          this.debounceTimers.delete("interactive");
        }
      }, DEFAULT_DEBOUNCE_TIME);

      // Store the timer reference using 'interactive' key
      this.debounceTimers.set("interactive", debounceTimer);
    } else {
      // Non-interactive mode: use debouncing per document instance
      // Create unique key for this specific document instance
      const timerKey = `${documentType}:${strand.documentId}`;
      
      // Clear any existing debounce timer for this document instance
      const existingTimer = this.debounceTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set up new debounced generation (no interactive confirmation)
      const debounceTimer = setTimeout(async () => {
        try {
          logger.info(
            `🔄 Routing document type "${documentType}" to generator (debounced)`,
          );

          // Direct generation, no interactive confirmation
          await generator.generate(strand);
          logger.info(
            `✅ Successfully generated code for document type: ${documentType}`,
          );
        } catch (error) {
          logger.error(
            `❌ Error generating code for document type "${documentType}":`,
            error,
          );
          // Don't throw - let codegen continue with other documents
        } finally {
          // Clean up the timer reference
          this.debounceTimers.delete(timerKey);
        }
      }, DEFAULT_DEBOUNCE_TIME);

      // Store the timer reference
      this.debounceTimers.set(timerKey, debounceTimer);
    }
  }

  /**
   * Process multiple strands in priority order (document-model types first)
   */
  private async processQueuedStrands(
    queuedStrands: QueuedStrand[],
  ): Promise<void> {
    logger.info(`🔄 Processing ${queuedStrands.length} queued strand(s)`);

    // Sort by priority (document-model first to ensure dependencies exist)
    const documentModelStrands = queuedStrands.filter(
      (qs: QueuedStrand) =>
        qs.strand.documentType === "powerhouse/document-model",
    );
    const otherStrands = queuedStrands.filter(
      (qs: QueuedStrand) =>
        qs.strand.documentType !== "powerhouse/document-model",
    );

    // Process document models first
    for (const queuedStrand of documentModelStrands) {
      await this.processStrand(queuedStrand.strand);
    }

    // Then process other document types
    for (const queuedStrand of otherStrands) {
      await this.processStrand(queuedStrand.strand);
    }

    logger.info(
      `✅ Successfully processed all ${queuedStrands.length} queued strand(s)`,
    );
  }

  /**
   * Process a single strand (used internally by processQueuedStrands)
   */
  private async processStrand(
    strand: InternalTransmitterUpdate,
  ): Promise<void> {
    const documentType = strand.documentType;
    const generator = this.getGenerator(documentType);

    if (!generator) {
      logger.warn(`⚠️ No generator found for document type: ${documentType}`);
      return;
    }

    try {
      logger.info(`🔄 Generating code for document type: ${documentType}`);
      await generator.generate(strand);
      logger.info(
        `✅ Successfully generated code for document type: ${documentType}`,
      );
    } catch (error) {
      logger.error(
        `❌ Error generating code for document type "${documentType}":`,
        error,
      );
      // Don't throw here to allow other strands to be processed
    }
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

  /**
   * Set interactive mode for code generation
   */
  setInteractiveMode(enabled: boolean): void {
    this.interactiveManager.setInteractiveMode(enabled);
  }

  /**
   * Check if interactive mode is enabled
   */
  isInteractiveMode(): boolean {
    return this.interactiveManager.isInteractive();
  }

  /**
   * Check if the manager is currently processing an interactive confirmation
   */
  isProcessingInteractive(): boolean {
    return this.interactiveManager.isProcessing();
  }
}
