import { getConfig } from "@powerhousedao/config/utils";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import {
  DocumentEditorHandler,
  DocumentModelHandler,
  PackageHandler,
  ProcessorHandler,
  SubgraphHandler,
  type DocumentHandler,
} from "./document-handlers/index.js";
import { logger } from "./logger.js";

const PH_CONFIG = getConfig();
const CURRENT_WORKING_DIR = process.cwd();

export class CodegenProcessor implements IProcessor {
  private handlers: Map<string, DocumentHandler> = new Map();

  constructor() {
    const config = { PH_CONFIG, CURRENT_WORKING_DIR };
    
    // Initialize handlers
    this.handlers.set("powerhouse/document-model", new DocumentModelHandler(config));
    this.handlers.set("powerhouse/package", new PackageHandler(config));
    this.handlers.set("powerhouse/document-editor", new DocumentEditorHandler(config));
    this.handlers.set("powerhouse/subgraph", new SubgraphHandler(config));
    this.handlers.set("powerhouse/processor", new ProcessorHandler(config));
  }

  async onStrands<TDocument extends DocumentModelDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    logger.debug(">>> onStrands", strands);

    // Process document models first to ensure they exist before generating editors
    const documentModelStrands = strands.filter(
      (s) => s.documentType === "powerhouse/document-model",
    );
    const otherStrands = strands.filter(
      (s) => s.documentType !== "powerhouse/document-model",
    );

    // Process document models first
    for (const strand of documentModelStrands) {
      const handler = this.handlers.get(strand.documentType);
      if (handler) {
        await handler.handle(strand);
      } else {
        logger.debug(">>> unknown document type", strand.documentType);
      }
    }

    // Then process other document types
    for (const strand of otherStrands) {
      const handler = this.handlers.get(strand.documentType);
      if (handler) {
        await handler.handle(strand);
      } else {
        logger.debug(">>> unknown document type", strand.documentType);
      }
    }
  }

  async onDisconnect() {}
}
