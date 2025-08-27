import {
  generateFromDocument,
  generateManifest,
  generateSubgraphFromDocumentModel,
  validateDocumentModelState,
} from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive";
import {
  type DocumentModelDocument,
  type DocumentModelState,
} from "document-model";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for document model documents
 */
export class DocumentModelGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-model";

  /**
   * Validate if this document model strand should be processed
   */
  shouldProcess(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): boolean {
    // First run base validation
    if (!super.shouldProcess(strand)) {
      return false;
    }

    // Validate document model state
    const state = strand.state as DocumentModelState;
    if (!state) {
      logger.debug(
        `>>> No state found for document model: ${strand.documentId}`,
      );
      return false;
    }

    const validationResult = validateDocumentModelState(state);
    if (!validationResult.isValid) {
      logger.debug(
        `>>> Validation failed for document model: ${state.name}`,
        validationResult.errors,
      );
      return false;
    }

    return true;
  }

  async generate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as DocumentModelState;

    // Validation is already done in shouldProcess, so we can proceed directly
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
      logger.error(`❌ Error during code generation for ${state.name}:`, error);
      // Don't throw - let codegen continue with other documents
      return;
    }
  }
}
