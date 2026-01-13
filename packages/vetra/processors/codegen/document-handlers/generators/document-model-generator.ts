import {
  generateFromDocument,
  generateManifest,
  validateDocumentModelState,
} from "@powerhousedao/codegen";
import type { InternalTransmitterUpdate } from "document-drive";
import type { DocumentModelGlobalState } from "document-model";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import { USE_TS_MORPH, USE_VERSIONING } from "./constants.js";
import { backupDocument } from "./utils.js";

/**
 * Generator for document model documents
 */
export class DocumentModelGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-model";

  /**
   * Validate if this document model strand should be processed
   */
  shouldProcess(strand: InternalTransmitterUpdate): boolean {
    // First run base validation
    if (!super.shouldProcess(strand)) {
      return false;
    }

    // Validate document model state
    const state = strand.state as DocumentModelGlobalState;
    if (!state) {
      logger.debug(
        `>>> No state found for document model: ${strand.documentId}`,
      );
      return false;
    }

    const validationResult = validateDocumentModelState(state);
    if (!validationResult.isValid) {
      const errorList = validationResult.errors
        .map((error) => `  - ${error}`)
        .join("\n");
      logger.info(
        `⚠️  Skipped code generation for '${state.name || strand.documentId}' due to validation errors:\n${errorList}`,
      );
      return false;
    }

    logger.info(
      `Document model ${state.name} is valid, proceeding with code generation`,
    );

    return true;
  }

  async generate(strand: InternalTransmitterUpdate): Promise<void> {
    const state = strand.state as DocumentModelGlobalState;
    // Validation is already done in shouldProcess, so we can proceed directly
    logger.debug(
      `🔄 Starting code generation for document model: ${state.name}`,
    );
    try {
      await generateFromDocument({
        documentModelState: state,
        config: this.config.PH_CONFIG,
        useTsMorph: USE_TS_MORPH,
        useVersioning: USE_VERSIONING,
      });
      logger.info(
        `✅ Code generation completed successfully for: ${state.name}`,
      );

      // Update the manifest with the new document model
      try {
        logger.debug(
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

        logger.debug(
          `✅ Manifest updated successfully for document model: ${state.name}`,
        );
      } catch (manifestError) {
        logger.error(
          `⚠️ Failed to update manifest for document model ${state.name}:`,
          manifestError,
        );
        // Don't throw here - code generation was successful
      }

      // Backup the document
      const extension = state.extension?.replace(/^\.+|\.+$/g, "") || "";
      await backupDocument(
        strand.document,
        this.config.CURRENT_WORKING_DIR,
        extension,
        state.name,
      );
    } catch (error) {
      logger.error(`❌ Error during code generation for ${state.name}:`, error);
      // Don't throw - let codegen continue with other documents
      return;
    }
  }
}
