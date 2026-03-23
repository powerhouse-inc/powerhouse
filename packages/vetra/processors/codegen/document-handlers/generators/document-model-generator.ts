import {
  generateFromDocument,
  generateManifest,
  validateDocumentModelState,
} from "@powerhousedao/codegen";
import type {
  DocumentModelGlobalState,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput } from "../types.js";
import { USE_TS_MORPH, USE_VERSIONING } from "./constants.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for document model documents
 */
export class DocumentModelGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-model";

  /**
   * Parse and extract the global state from the serialized state string
   */
  private extractGlobalState(
    input: CodegenInput,
  ): DocumentModelGlobalState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as DocumentModelPHState;
    return fullState.global;
  }

  /**
   * Validate if this document model strand should be processed
   */
  shouldProcess(input: CodegenInput): boolean {
    // First run base validation
    if (!super.shouldProcess(input)) {
      return false;
    }

    // Extract the global state from the full document state
    const globalState = this.extractGlobalState(input);
    if (!globalState) {
      logger.debug(
        `>>> No global state found for document model: ${input.documentId}`,
      );
      return false;
    }

    const validationResult = validateDocumentModelState(globalState);
    if (!validationResult.isValid) {
      const errorList = validationResult.errors
        .map((error) => `  - ${error}`)
        .join("\n");
      logger.info(
        `⚠️  Skipped code generation for '${globalState.name || input.documentId}' due to validation errors:\n${errorList}`,
      );
      return false;
    }

    logger.info(
      `Document model ${globalState.name} is valid, proceeding with code generation`,
    );

    return true;
  }

  async generate(input: CodegenInput): Promise<void> {
    const globalState = this.extractGlobalState(input);
    if (!globalState) {
      logger.error(
        `❌ No global state found for document model: ${input.documentId}`,
      );
      return;
    }
    // Validation is already done in shouldProcess, so we can proceed directly
    logger.debug(
      `🔄 Starting code generation for document model: ${globalState.name}`,
    );
    try {
      await generateFromDocument({
        documentModelState: globalState,
        config: this.config.PH_CONFIG,
        useTsMorph: USE_TS_MORPH,
        useVersioning: USE_VERSIONING,
      });
      logger.info(
        `✅ Code generation completed successfully for: ${globalState.name}`,
      );

      // Update the manifest with the new document model
      try {
        logger.debug(
          `🔄 Updating manifest with document model: ${globalState.name} (ID: ${globalState.id})`,
        );

        generateManifest(
          {
            documentModels: [
              {
                id: globalState.id,
                name: globalState.name,
              },
            ],
          },
          this.config.CURRENT_WORKING_DIR,
        );

        logger.debug(
          `✅ Manifest updated successfully for document model: ${globalState.name}`,
        );
      } catch (manifestError) {
        logger.error(
          `⚠️ Failed to update manifest for document model ${globalState.name}:`,
          manifestError,
        );
        // Don't throw here - code generation was successful
      }

      // Backup the document
      const fullState = input.state as DocumentModelPHState;
      const extension = globalState.extension?.replace(/^\.+|\.+$/g, "") || "";
      await minimalBackupDocument(
        {
          documentId: input.documentId,
          documentType: input.documentType,
          branch: input.branch,
          state: fullState,
          name: globalState.name,
        },
        this.config.CURRENT_WORKING_DIR,
        extension,
      );
    } catch (error) {
      logger.error(
        `❌ Error during code generation for ${globalState.name}:`,
        error,
      );
      // Don't throw - let codegen continue with other documents
      return;
    }
  }
}
