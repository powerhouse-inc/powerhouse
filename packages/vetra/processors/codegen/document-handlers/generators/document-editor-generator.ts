import { generateEditor, generateManifest } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import type {
  DocumentEditorPHState,
  DocumentEditorState,
} from "../../../../document-models/document-editor/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput } from "../types.js";
import { USE_TS_MORPH } from "./constants.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for document editor documents
 */
export class DocumentEditorGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-editor";

  /**
   * Parse and extract the global state from the serialized state string
   */
  private extractGlobalState(
    input: CodegenInput,
  ): DocumentEditorState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as DocumentEditorPHState;
    return fullState.global;
  }

  /**
   * Validate if this document editor strand should be processed
   */
  shouldProcess(input: CodegenInput): boolean {
    // First run base validation
    if (!super.shouldProcess(input)) {
      return false;
    }

    const state = this.extractGlobalState(input);
    if (!state) {
      logger.debug(`No state found for document editor: ${input.documentId}`);
      return false;
    }

    // Check if we have a valid editor name, document types, and it's confirmed
    if (!state.name) {
      logger.debug(`No name found for document editor: ${input.documentId}`);
      return false;
    }

    if (!state.documentTypes || state.documentTypes.length === 0) {
      logger.debug(
        `No document types found for document editor: ${state.name}`,
      );
      return false;
    }

    if (state.status !== "CONFIRMED") {
      logger.debug(
        `Document editor not confirmed: ${state.name} (status: ${state.status})`,
      );
      return false;
    }

    return true;
  }

  async generate(input: CodegenInput): Promise<void> {
    const state = this.extractGlobalState(input);
    if (!state) {
      logger.error(`No state found for document editor: ${input.documentId}`);
      return;
    }

    // Validation is already done in shouldProcess, so we can proceed directly
    logger.info(`🔄 Starting editor generation for: ${state.name}`);
    try {
      // Extract document types from the state
      const documentTypes = state.documentTypes.map((dt) => dt.documentType);

      // Generate editor ID using kebabCase
      const editorId: string = kebabCase(state.name);

      // Generate the editor using the codegen function
      await generateEditor({
        ...this.config.PH_CONFIG,
        editorName: state.name,
        documentTypes: documentTypes,
        editorId: editorId,
        useTsMorph: USE_TS_MORPH,
      });

      logger.info(
        `✅ Editor generation completed successfully for: ${state.name}`,
      );

      // Update the manifest with the new editor
      try {
        logger.debug(
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

        logger.debug(
          `✅ Manifest updated successfully for editor: ${state.name}`,
        );
      } catch (manifestError) {
        logger.error(
          `⚠️ Failed to update manifest for editor ${state.name}:`,
          manifestError,
        );
        // Don't throw here - editor generation was successful
      }

      // Backup the document
      const fullState = input.state as DocumentEditorPHState;
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
