import { getConfig } from "@powerhousedao/config/utils";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import {
  AppHandler,
  DocumentEditorHandler,
  DocumentModelHandler,
  PackageHandler,
  ProcessorHandler,
  SubgraphHandler,
  type DocumentHandler,
} from "./document-handlers/index.js";
import { logger } from "./logger.js";
import { debounce } from "./utils.js";

const PH_CONFIG = getConfig();
const CURRENT_WORKING_DIR = process.cwd();
const DEBOUNCE_DELAY = 1000;

export class CodegenProcessor implements IProcessor {
  private handlers: Map<string, DocumentHandler> = new Map();
  private debouncedHandlers: Map<string, ReturnType<typeof debounce>> =
    new Map();

  constructor() {
    const config = { PH_CONFIG, CURRENT_WORKING_DIR };

    // Initialize handlers
    this.handlers.set(
      "powerhouse/document-model",
      new DocumentModelHandler(config),
    );
    this.handlers.set("powerhouse/package", new PackageHandler(config));
    this.handlers.set(
      "powerhouse/document-editor",
      new DocumentEditorHandler(config),
    );
    this.handlers.set("powerhouse/subgraph", new SubgraphHandler(config));
    this.handlers.set("powerhouse/processor", new ProcessorHandler(config));
    this.handlers.set("powerhouse/app", new AppHandler(config));

    // Initialize debounced handlers for each document type
    this.#initializeDebouncedHandlers();
  }

  async onStrands<TDocument extends DocumentModelDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    // Group strands by document type and keep only the latest one for each type
    const latestStrandsByType = new Map<
      string,
      InternalTransmitterUpdate<TDocument>
    >();

    for (const strand of strands) {
      // Replace any existing strand with the latest one for this document type
      latestStrandsByType.set(strand.documentType, strand);
    }

    // Process all document types with debouncing
    for (const [documentType, strand] of latestStrandsByType) {
      const debouncedHandler = this.debouncedHandlers.get(documentType);
      if (debouncedHandler) {
        debouncedHandler(strand);
      } else {
        logger.info(
          `>>> No debounced handler found for document type ${documentType}`,
        );
      }
    }
  }

  async onDisconnect() {}

  #initializeDebouncedHandlers() {
    const documentTypes = [
      "powerhouse/document-model",
      "powerhouse/package",
      "powerhouse/document-editor",
      "powerhouse/subgraph",
      "powerhouse/processor",
      "powerhouse/app",
    ];

    documentTypes.forEach((documentType) => {
      const debouncedHandler = debounce(
        async (strand: InternalTransmitterUpdate<DocumentModelDocument>) => {
          const handler = this.handlers.get(documentType);
          if (handler) {
            await handler.handle(strand);
          } else {
            logger.info(`>>> unknown document type ${documentType}`);
          }
        },
        DEBOUNCE_DELAY,
      );

      this.debouncedHandlers.set(documentType, debouncedHandler);
    });
  }
}
