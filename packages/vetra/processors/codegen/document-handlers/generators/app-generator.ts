import { generateApp } from "@powerhousedao/codegen";
import type {
  AppModuleGlobalState,
  AppModulePHState,
} from "@powerhousedao/vetra/document-models/app-module";
import { kebabCase } from "change-case";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput, GenerateResult } from "../types.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for app documents
 */
export class AppGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/app";

  private extractGlobalState(
    input: CodegenInput,
  ): AppModuleGlobalState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as AppModulePHState;
    return fullState.global;
  }

  override skipReason(input: CodegenInput): string | undefined {
    const base = super.skipReason(input);
    if (base) return base;

    const state = this.extractGlobalState(input);
    let reason: string | undefined;
    if (!state) reason = "The app has no state";
    else if (!state.name) reason = "The app has no name";
    else if (state.status !== "CONFIRMED") {
      reason = `App "${state.name}" is not confirmed (status: ${state.status}); codegen runs once it is CONFIRMED`;
    }
    if (reason) logger.debug(reason);
    return reason;
  }

  async generate(input: CodegenInput): Promise<GenerateResult> {
    const state = this.extractGlobalState(input);
    const reason = this.skipReason(input);
    if (!state || reason) {
      return { skipped: reason ?? "The app has no state" };
    }

    logger.info(`🔄 Starting app generation for app: ${state.name}`);
    try {
      await generateApp(
        {
          ...this.config.PH_CONFIG,
          appName: state.name,
          appId: kebabCase(state.name),
          allowedDocumentTypes: state.allowedDocumentTypes ?? [],
          isDragAndDropEnabled: state.isDragAndDropEnabled,
        },
        this.project,
      );
      await this.project.save();
    } catch (error) {
      logger.error(
        `❌ Error during app generation for app ${state.name}:`,
        error,
      );
      throw error;
    }

    logger.info(
      `✅ App generation completed successfully for app: ${state.name}`,
    );

    await minimalBackupDocument(
      {
        documentId: input.documentId,
        documentType: input.documentType,
        branch: input.branch,
        state: input.state as AppModulePHState,
        name: state.name,
      },
      this.config.CURRENT_WORKING_DIR,
    );
  }
}
