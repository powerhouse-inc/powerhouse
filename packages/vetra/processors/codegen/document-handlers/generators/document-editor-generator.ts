import { generateEditor, generateManifest } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type DocumentEditorState } from "../../../../document-models/document-editor/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for document editor documents
 */
export class DocumentEditorGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-editor";

  async generate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as DocumentEditorState;

    // Check if we have a valid editor name, document types, and it's confirmed
    if (
      state.name &&
      state.documentTypes.length > 0 &&
      state.status === "CONFIRMED"
    ) {
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
      }
    } else {
      if (!state.name) {
        logger.error(`❌ Skipping editor generation - missing name for editor`);
        return;
      } else if (state.documentTypes.length === 0) {
        logger.error(
          `❌ Skipping editor generation - missing document types for editor "${state.name}"`,
        );
        return;
      } else if (state.status !== "CONFIRMED") {
        logger.error(
          `❌ Skipping editor generation - editor "${state.name}" is not confirmed (status: ${state.status})`,
        );
        return;
      }
    }
  }
}
