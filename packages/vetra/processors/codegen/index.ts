import { getConfig } from "@powerhousedao/config/utils";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { DocumentCodegenFactory } from "./document-handlers/index.js";
import { type DocumentCodegenManager } from "./document-handlers/document-codegen-manager.js";
import { logger } from "./logger.js";

const PH_CONFIG = getConfig();
const CURRENT_WORKING_DIR = process.cwd();

export class CodegenProcessor implements IProcessor {
  private manager: DocumentCodegenManager;

  constructor() {
    // Determine interactive mode from environment variable
    const isInteractive =
      process.env.CODEGEN_INTERACTIVE?.toLowerCase() === "true";

    this.manager = DocumentCodegenFactory.createManager(
      {
        PH_CONFIG,
        CURRENT_WORKING_DIR,
      },
      isInteractive,
    );

    if (isInteractive) {
      logger.info(
        `🔔 CodegenProcessor initialized with interactive mode enabled (CODEGEN_INTERACTIVE=${process.env.CODEGEN_INTERACTIVE})`,
      );
    } else {
      logger.debug(
        `CodegenProcessor initialized with interactive mode disabled`,
      );
    }
  }

  async onStrands<TDocument extends DocumentModelDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    logger.debug(">>> onStrands", strands);

    // Filter strands to only include those that should be processed
    const validStrands = strands.filter((strand) => {
      const generator = this.manager.getGenerator(strand.documentType);
      if (!generator) {
        logger.debug(
          `>>> No generator found for document type: ${strand.documentType}`,
        );
        return false;
      }

      // Use the required shouldProcess method for validation
      const shouldProcessResult = generator.shouldProcess(strand);
      if (!shouldProcessResult) {
        logger.debug(
          `>>> Generator validation failed for ${strand.documentType}:${strand.documentId}, skipping processing`,
        );
      }
      return shouldProcessResult;
    });

    if (validStrands.length > 0) {
      logger.debug(
        `>>> Processing ${validStrands.length} valid strands (out of ${strands.length} total)`,
      );
      for (const strand of validStrands) {
        await this.manager.routeAndGenerate(strand);
      }
    } else {
      logger.debug(
        `>>> No valid strands to process (${strands.length} strands received)`,
      );
    }
  }

  async onDisconnect() {}

  // Utility methods for external configuration and monitoring
  public setInteractiveMode(enabled: boolean): void {
    this.manager.setInteractiveMode(enabled);
  }

  public isInteractive(): boolean {
    return this.manager.isInteractiveMode();
  }

  public isProcessingInteractive(): boolean {
    return this.manager.isProcessingInteractive();
  }
}
