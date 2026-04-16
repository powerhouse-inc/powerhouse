import { generateSubgraph } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import type {
  SubgraphModulePHState,
  SubgraphModuleState,
} from "../../../../document-models/subgraph-module/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput } from "../types.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for subgraph documents
 */
export class SubgraphGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/subgraph";

  /**
   * Parse and extract the global state from the serialized state string
   */
  private extractGlobalState(
    input: CodegenInput,
  ): SubgraphModuleState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as SubgraphModulePHState;
    return fullState.global;
  }

  /**
   * Validate if this subgraph strand should be processed
   */
  shouldProcess(input: CodegenInput): boolean {
    // First run base validation
    if (!super.shouldProcess(input)) {
      return false;
    }

    const state = this.extractGlobalState(input);
    if (!state) {
      logger.debug(`No state found for subgraph: ${input.documentId}`);
      return false;
    }

    // Check if we have a valid subgraph name and it's confirmed
    if (!state.name) {
      logger.debug(`No name found for subgraph: ${input.documentId}`);
      return false;
    }

    if (state.status !== "CONFIRMED") {
      logger.debug(
        `Subgraph not confirmed: ${state.name} (status: ${state.status})`,
      );
      return false;
    }

    return true;
  }

  async generate(input: CodegenInput): Promise<void> {
    const state = this.extractGlobalState(input);
    if (!state) {
      logger.error(`No state found for subgraph: ${input.documentId}`);
      return;
    }

    // Check if we have a valid subgraph name and it's confirmed
    if (state.name && state.status === "CONFIRMED") {
      logger.info(`🔄 Starting subgraph generation for: ${state.name}`);
      try {
        // Generate subgraph ID using kebabCase
        const subgraphId: string = kebabCase(state.name);

        await generateSubgraph(state.name, null);
        logger.info(
          `✅ Subgraph generation completed successfully for: ${state.name}`,
        );

        // Backup the document
        const fullState = input.state as SubgraphModulePHState;
        await minimalBackupDocument(
          {
            documentId: input.documentId,
            documentType: input.documentType,
            branch: input.branch,
            state: fullState,
            name: state.name,
          },
          this.config.CURRENT_WORKING_DIR,
        );
      } catch (error) {
        logger.error(
          `❌ Error during subgraph generation for ${state.name}:`,
          error,
        );
      }
    } else {
      if (!state.name) {
        logger.error(
          `❌ Skipping subgraph generation - missing name for subgraph`,
        );
        return;
      } else if (state.status !== "CONFIRMED") {
        logger.error(
          `❌ Skipping subgraph generation - subgraph "${state.name}" is not confirmed (status: ${state.status})`,
        );
        return;
      }
    }
  }
}
