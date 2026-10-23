import type {
  IProcessor,
  IReactorClient,
  OperationWithContext,
} from "@powerhousedao/reactor-browser";
import type { PowerhouseConfig } from "@powerhousedao/shared";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
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
    private readonly driveId: string,
    private readonly client: IReactorClient,
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
    this.manager.setScope((documentId) => this.isInDrive(documentId));

    if (interactiveMode) {
      logger.info(`CodegenProcessor initialized with interactive mode enabled`);
    } else {
      logger.debug(
        `CodegenProcessor initialized with interactive mode disabled`,
      );
    }
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    logger.debug("CodegenProcessor.onOperations()");

    // Only a document's final state in the batch is generated from.
    const latest = new Map<string, OperationWithContext>();
    for (const operation of operations) {
      latest.set(operation.context.documentId, operation);
    }

    for (const { context } of latest.values()) {
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

      await this.manager.routeAndGenerate(input);
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

  /**
   * The reactor delivers every drive's operations, so membership is checked
   * here: a node of the drive (in any folder, and in drives older than
   * relationship edges), or a child edge from it (a document attached by
   * relationship alone).
   */
  private async isInDrive(documentId: string): Promise<boolean> {
    try {
      const drive = await this.client.get<DocumentDriveDocument>(this.driveId);
      if (drive.state.global.nodes.some((node) => node.id === documentId)) {
        return true;
      }
    } catch (error) {
      logger.debug(`Could not read the Vetra drive ${this.driveId}:`, error);
    }
    try {
      const parents = await this.client.getIncomingRelationshipEdges(
        documentId,
        "child",
      );
      return parents.results.some((edge) => edge.sourceId === this.driveId);
    } catch (error) {
      logger.debug(`Could not read the parents of ${documentId}:`, error);
      return false;
    }
  }
}
