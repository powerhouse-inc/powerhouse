import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type Config } from "./types.js";

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
  abstract generate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void>;

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
}
