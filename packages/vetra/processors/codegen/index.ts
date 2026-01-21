import { getConfig } from "@powerhousedao/config/node";
import type { IProcessor, OperationWithContext } from "@powerhousedao/reactor";
import type { InternalTransmitterUpdate } from "document-drive";
import type { DocumentCodegenManager } from "./document-handlers/document-codegen-manager.js";
import { DocumentCodegenFactory } from "./document-handlers/index.js";
import { logger } from "./logger.js";

const PH_CONFIG = getConfig();
const CURRENT_WORKING_DIR = process.cwd();

export class CodegenProcessor implements IProcessor {
  private manager: DocumentCodegenManager;

  constructor(interactiveMode = false) {
    this.manager = DocumentCodegenFactory.createManager(
      {
        PH_CONFIG,
        CURRENT_WORKING_DIR,
      },
      interactiveMode,
    );

    if (interactiveMode) {
      logger.info(`CodegenProcessor initialized with interactive mode enabled`);
    } else {
      logger.debug(
        `CodegenProcessor initialized with interactive mode disabled`,
      );
    }
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    logger.info(">>> CodegenProcessor.onOperations()");

    for (const { operation, context } of operations) {
      const generator = this.manager.getGenerator(context.documentType);
      if (!generator) {
        logger.debug(
          `>>> No generator found for document type: ${context.documentType}`,
        );
        continue;
      }

      // Create strand-like object for generator (using existing generator interface)
      // Cast to InternalTransmitterUpdate since generators only use a subset of fields
      const strand = {
        documentId: context.documentId,
        documentType: context.documentType,
        scope: context.scope,
        branch: context.branch,
        driveId: "", // Not available in new format
        operations: [operation],
        state: context.resultingState
          ? (JSON.parse(context.resultingState) as unknown)
          : undefined,
      } as InternalTransmitterUpdate;

      const shouldProcess = generator.shouldProcess(strand);
      if (shouldProcess) {
        await this.manager.routeAndGenerate(strand);
      }
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
