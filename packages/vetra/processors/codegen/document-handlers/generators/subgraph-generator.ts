import { generateManifest, generateSubgraph } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type SubgraphModuleState } from "../../../../document-models/subgraph-module/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for subgraph documents
 */
export class SubgraphGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/subgraph";

  /**
   * Validate if this subgraph strand should be processed
   */
  shouldProcess(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): boolean {
    // First run base validation
    if (!super.shouldProcess(strand)) {
      return false;
    }

    const state = strand.state as SubgraphModuleState;
    if (!state) {
      logger.debug(`>>> No state found for subgraph: ${strand.documentId}`);
      return false;
    }

    // Check if we have a valid subgraph name and it's confirmed
    if (!state.name) {
      logger.debug(`>>> No name found for subgraph: ${strand.documentId}`);
      return false;
    }

    if (state.status !== "CONFIRMED") {
      logger.debug(
        `>>> Subgraph not confirmed: ${state.name} (status: ${state.status})`,
      );
      return false;
    }

    return true;
  }

  async generate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as SubgraphModuleState;

    // Check if we have a valid subgraph name and it's confirmed
    if (state.name && state.status === "CONFIRMED") {
      logger.info(`🔄 Starting subgraph generation for: ${state.name}`);
      try {
        // Generate subgraph ID using kebabCase
        const subgraphId: string = kebabCase(state.name);

        await generateSubgraph(state.name, null, this.config.PH_CONFIG);
        logger.info(
          `✅ Subgraph generation completed successfully for: ${state.name}`,
        );

        // Update the manifest with the new subgraph
        try {
          logger.info(
            `🔄 Updating manifest with subgraph: ${state.name} (ID: ${subgraphId})`,
          );

          generateManifest(
            {
              subgraphs: [
                {
                  id: subgraphId,
                  name: state.name,
                  documentTypes: [],
                },
              ],
            },
            this.config.CURRENT_WORKING_DIR,
          );

          logger.info(
            `✅ Manifest updated successfully for subgraph: ${state.name}`,
          );
        } catch (manifestError) {
          logger.error(
            `⚠️ Failed to update manifest for subgraph ${state.name}:`,
            manifestError,
          );
          // Don't throw here - subgraph generation was successful
        }
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
