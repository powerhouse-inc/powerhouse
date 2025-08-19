import {
  generateFromDocument,
  generateManifest,
  generateSubgraphFromDocumentModel,
  validateDocumentModelState,
} from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import {
  type DocumentModelDocument,
  type DocumentModelState,
} from "document-model";
import { logger } from "../logger.js";
import { type Config, type DocumentHandler } from "./types.js";

export class DocumentModelHandler implements DocumentHandler {
  documentType = "powerhouse/document-model";

  constructor(private config: Config) {}

  async handle(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as DocumentModelState;
    const validationResult = validateDocumentModelState(state);

    if (validationResult.isValid) {
      logger.info(
        `🔄 Starting code generation for document model: ${state.name}`,
      );
      try {
        await generateFromDocument(state, this.config.PH_CONFIG, {
          verbose: false,
        });
        await generateSubgraphFromDocumentModel(
          state.name,
          state,
          this.config.PH_CONFIG,
          { verbose: false },
        );
        logger.info(
          `✅ Code generation completed successfully for: ${state.name}`,
        );

        // Update the manifest with the new document model
        try {
          logger.info(
            `🔄 Updating manifest with document model: ${state.name} (ID: ${state.id})`,
          );

          generateManifest(
            {
              documentModels: [
                {
                  id: state.id,
                  name: state.name,
                },
              ],
            },
            this.config.CURRENT_WORKING_DIR,
          );

          logger.info(
            `✅ Manifest updated successfully for document model: ${state.name}`,
          );
        } catch (manifestError) {
          logger.error(
            `⚠️ Failed to update manifest for document model ${state.name}:`,
            manifestError,
          );
          // Don't throw here - code generation was successful
        }
      } catch (error) {
        logger.error(
          `❌ Error during code generation for ${state.name}:`,
          error,
        );
      }
    } else {
      logger.error(
        `❌ Validation failed for document model: ${state.name}`,
        validationResult.errors,
      );
    }
  }
}
