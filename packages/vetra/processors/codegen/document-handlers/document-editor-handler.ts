import { generateEditor } from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type DocumentEditorState } from "../../../document-models/document-editor/index.js";
import { logger } from "../logger.js";
import { type DocumentHandler, type Config } from "./types.js";

export class DocumentEditorHandler implements DocumentHandler {
  documentType = "powerhouse/document-editor";
  
  constructor(private config: Config) {}

  async handle(strand: InternalTransmitterUpdate<DocumentModelDocument>): Promise<void> {
    const state = strand.state as DocumentEditorState;

    // Check if we have a valid editor name, document types, and it's confirmed
    if (state.name && state.documentTypes.length > 0 && state.status === "CONFIRMED") {
      logger.info(`🔄 Starting editor generation for: ${state.name}`);
      try {
        // Extract document types from the state
        const documentTypes = state.documentTypes.map(
          (dt) => dt.documentType,
        );

        // Generate the editor using the codegen function
        await generateEditor(state.name, documentTypes, this.config.PH_CONFIG);

        logger.info(
          `✅ Editor generation completed successfully for: ${state.name}`,
        );
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
        logger.debug(
          `⚠️ Skipping editor generation - missing name for editor`,
        );
      } else if (state.documentTypes.length === 0) {
        logger.debug(
          `⚠️ Skipping editor generation - missing document types for editor "${state.name}"`,
        );
      } else if (state.status !== "CONFIRMED") {
        logger.debug(
          `ℹ️ Skipping editor generation - editor "${state.name}" is not confirmed (status: ${state.status})`,
        );
      }
    }
  }
}