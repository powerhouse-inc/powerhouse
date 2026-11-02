import { generateEditor } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import type {
  DocumentEditorPHState,
  DocumentEditorState,
} from "../../../../document-models/document-editor/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput, GenerateResult } from "../types.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for document editor documents
 */
export class DocumentEditorGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/document-editor";

  private extractGlobalState(
    input: CodegenInput,
  ): DocumentEditorState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as DocumentEditorPHState;
    return fullState.global;
  }

  override skipReason(input: CodegenInput): string | undefined {
    const base = super.skipReason(input);
    if (base) return base;

    const state = this.extractGlobalState(input);
    let reason: string | undefined;
    if (!state) reason = "The editor has no state";
    else if (!state.name) reason = "The editor has no name";
    else if (state.documentTypes.length === 0) {
      reason = `Editor "${state.name}" has no document types`;
    } else if (state.status !== "CONFIRMED") {
      reason = `Editor "${state.name}" is not confirmed (status: ${state.status}); codegen runs once it is CONFIRMED`;
    }
    if (reason) logger.debug(reason);
    return reason;
  }

  async generate(input: CodegenInput): Promise<GenerateResult> {
    const state = this.extractGlobalState(input);
    if (!state) {
      return { skipped: "The editor has no state" };
    }

    logger.info(`🔄 Starting editor generation for: ${state.name}`);
    try {
      await generateEditor(
        {
          ...this.config.PH_CONFIG,
          editorName: state.name,
          documentTypes: state.documentTypes.map((dt) => dt.documentType),
          editorId: kebabCase(state.name),
        },
        this.project,
      );
      await this.project.save();
    } catch (error) {
      logger.error(
        `❌ Error during editor generation for ${state.name}:`,
        error,
      );
      throw error;
    }

    logger.info(
      `✅ Editor generation completed successfully for: ${state.name}`,
    );

    await minimalBackupDocument(
      {
        documentId: input.documentId,
        documentType: input.documentType,
        branch: input.branch,
        state: input.state as DocumentEditorPHState,
        name: state.name,
      },
      this.config.CURRENT_WORKING_DIR,
    );
  }
}
