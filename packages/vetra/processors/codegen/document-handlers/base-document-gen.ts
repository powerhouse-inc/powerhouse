import type { InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import type { Config } from "./types.js";

/**
 * Abstract base class for document generators
 * Defines the interface that all document-type handlers must implement
 */
export abstract class BaseDocumentGen {
  /**
   * The document type(s) this generator supports
   * Can be a single string or an array of strings for generators that handle multiple types
   */
  abstract readonly supportedDocumentTypes: string | string[];

  constructor(protected config: Config) {}

  /**
   * Generate code for the given document
   * Must be implemented by each specific document generator
   */
  abstract generate(strand: InternalTransmitterUpdate): Promise<void>;

  /**
   * Check if this generator supports the given document type
   */
  supportsDocumentType(documentType: string): boolean {
    if (typeof this.supportedDocumentTypes === "string") {
      return this.supportedDocumentTypes === documentType;
    }
    return this.supportedDocumentTypes.includes(documentType);
  }

  /**
   * Get all supported document types as an array
   */
  getSupportedDocumentTypes(): string[] {
    if (typeof this.supportedDocumentTypes === "string") {
      return [this.supportedDocumentTypes];
    }
    return [...this.supportedDocumentTypes];
  }

  /**
   * Validate if this strand should be processed
   * Override this method in specific generators to add custom validation logic
   */
  shouldProcess(strand: InternalTransmitterUpdate): boolean {
    // Basic validation: ensure strand has required properties
    if (!strand.documentId || !strand.documentType) {
      return false;
    }

    // Basic validation: check if document type is supported
    if (!this.supportsDocumentType(strand.documentType)) {
      return false;
    }

    // Default to processing if basic validation passes
    return true;
  }
}
