import type {
  IProcessor,
  OperationWithContext,
} from "@powerhousedao/reactor-browser";
import type { PowerhouseConfig } from "@powerhousedao/shared";
import type { Project } from "ts-morph";
import type { DocumentCodegenManager } from "./document-handlers/document-codegen-manager.js";
import { DocumentCodegenFactory } from "./document-handlers/index.js";
import type { CodegenInput } from "./document-handlers/types.js";
import { logger } from "./logger.js";

export class CodegenProcessor implements IProcessor {
  private manager: DocumentCodegenManager;

  constructor(
    project: Project,
    config: PowerhouseConfig,
    cwd: string,
    interactiveMode = false,
  ) {
    this.manager = DocumentCodegenFactory.createManager(
      {
        PH_CONFIG: config,
        CURRENT_WORKING_DIR: cwd,
      },
      project,
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
    logger.info("CodegenProcessor.onOperations()");

    for (const { context } of operations) {
      const generator = this.manager.getGenerator(context.documentType);
      if (!generator) {
        logger.debug(
          `No generator found for document type: ${context.documentType}`,
        );
        continue;
      }

      const input: CodegenInput = {
        documentId: context.documentId,
        documentType: context.documentType,
        scope: context.scope,
        branch: context.branch,
        state: context.resultingState
          ? JSON.parse(context.resultingState)
          : undefined,
      };

      const shouldProcess = generator.shouldProcess(input);
      if (shouldProcess) {
        await this.manager.routeAndGenerate(input);
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
