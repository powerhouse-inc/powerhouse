import { generateEditor, generateManifest } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentEditorState } from "../../../../document-models/document-editor/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for document editor documents
 */
export class DocumentEditorGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-editor";

  /**
   * Validate if this document editor strand should be processed
   */
  shouldProcess(strand: InternalTransmitterUpdate): boolean {
    // First run base validation
    if (!super.shouldProcess(strand)) {
      return false;
    }

    const state = strand.state as DocumentEditorState;
    if (!state) {
      logger.debug(
        `>>> No state found for document editor: ${strand.documentId}`,
      );
      return false;
    }

    // Check if we have a valid editor name, document types, and it's confirmed
    if (!state.name) {
      logger.debug(
        `>>> No name found for document editor: ${strand.documentId}`,
      );
      return false;
    }

    if (!state.documentTypes || state.documentTypes.length === 0) {
      logger.debug(
        `>>> No document types found for document editor: ${state.name}`,
      );
      return false;
    }

    if (state.status !== "CONFIRMED") {
      logger.debug(
        `>>> Document editor not confirmed: ${state.name} (status: ${state.status})`,
      );
      return false;
    }

    return true;
  }

  async generate(strand: InternalTransmitterUpdate): Promise<void> {
    const state = strand.state as DocumentEditorState;

    // Validation is already done in shouldProcess, so we can proceed directly
    logger.info(`🔄 Starting editor generation for: ${state.name}`);
    try {
      // Extract document types from the state
      const documentTypes = state.documentTypes.map((dt) => dt.documentType);

      // Generate editor ID using kebabCase
      const editorId: string = kebabCase(state.name);

      // Generate the editor using the codegen function
      await generateEditor(
        state.name,
        documentTypes,
        this.config.PH_CONFIG,
        editorId,
      );

      logger.info(
        `✅ Editor generation completed successfully for: ${state.name}`,
      );

      // Update the manifest with the new editor
      try {
        logger.info(
          `🔄 Updating manifest with editor: ${state.name} (ID: ${editorId})`,
        );

        generateManifest(
          {
            editors: [
              {
                id: editorId,
                name: state.name,
                documentTypes: documentTypes,
              },
            ],
          },
          this.config.CURRENT_WORKING_DIR,
        );

        logger.info(
          `✅ Manifest updated successfully for editor: ${state.name}`,
        );
      } catch (manifestError) {
        logger.error(
          `⚠️ Failed to update manifest for editor ${state.name}:`,
          manifestError,
        );
        // Don't throw here - editor generation was successful
      }
    } catch (error) {
      logger.error(
        `❌ Error during editor generation for ${state.name}:`,
        error,
      );
      if (error instanceof Error) {
        logger.error(`❌ Error message: ${error.message}`);
      }
      // Don't throw - let codegen continue with other documents
      return;
    }
  }
}
