import {
  generateDocumentModel,
  validateDocumentModelState,
} from "@powerhousedao/codegen";
import type {
  DocumentModelGlobalState,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput } from "../types.js";
import { minimalBackupDocument, warnSubgraphTypeConflicts } from "./utils.js";

/**
 * Generator for document model documents
 */
export class DocumentModelGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-model";

  private extractGlobalState(
    input: CodegenInput,
  ): DocumentModelGlobalState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as DocumentModelPHState;
    return fullState.global;
  }

  skipReason(input: CodegenInput): string | undefined {
    const base = super.skipReason(input);
    if (base) return base;

    const globalState = this.extractGlobalState(input);
    if (!globalState) {
      logger.debug(
        `>>> No global state found for document model: ${input.documentId}`,
      );
      return "The document model has no global state";
    }

    const validationResult = validateDocumentModelState(globalState);
    if (!validationResult.isValid) {
      const errorList = validationResult.errors
        .map((error) => `  - ${error}`)
        .join("\n");
      logger.info(
        `⚠️  Skipped code generation for '${globalState.name || input.documentId}' due to validation errors:\n${errorList}`,
      );
      return `The document model is not ready for code generation:\n${errorList}`;
    }

    logger.info(
      `Document model ${globalState.name} is valid, proceeding with code generation`,
    );
    return undefined;
  }

  async generate(input: CodegenInput): Promise<void> {
    const globalState = this.extractGlobalState(input);
    if (!globalState) {
      throw new Error(
        `No global state found for document model: ${input.documentId}`,
      );
    }
    logger.debug(
      `🔄 Starting code generation for document model: ${globalState.name}`,
    );
    try {
      await generateDocumentModel(globalState, this.project);
      await this.project.save();
    } catch (error) {
      logger.error(
        `❌ Error during code generation for ${globalState.name}:`,
        error,
      );
      throw error;
    }
    logger.info(
      `✅ Code generation completed successfully for: ${globalState.name}`,
    );
    await warnSubgraphTypeConflicts(this.config.CURRENT_WORKING_DIR);

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
  }
}
