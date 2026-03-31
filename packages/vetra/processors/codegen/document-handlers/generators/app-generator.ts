import { generateApp, generateManifest } from "@powerhousedao/codegen";
import type {
  AppModuleGlobalState,
  AppModulePHState,
} from "@powerhousedao/vetra/document-models/app-module";
import { kebabCase } from "change-case";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput } from "../types.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for app documents
 */
export class AppGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/app";

  /**
   * Parse and extract the global state from the serialized state string
   */
  private extractGlobalState(
    input: CodegenInput,
  ): AppModuleGlobalState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as AppModulePHState;
    return fullState.global;
  }

  /**
   * Validate if this app strand should be processed
   */
  shouldProcess(input: CodegenInput): boolean {
    // First run base validation
    if (!super.shouldProcess(input)) {
      return false;
    }

    const state = this.extractGlobalState(input);
    if (!state) {
      logger.debug(`No state found for app: ${input.documentId}`);
      return false;
    }

    // Check if we have a valid app name and it's confirmed
    if (!state.name) {
      logger.debug(`No name found for app: ${input.documentId}`);
      return false;
    }

    if (state.status !== "CONFIRMED") {
      logger.debug(
        `App not confirmed: ${state.name} (status: ${state.status})`,
      );
      return false;
    }

    return true;
  }

  async generate(input: CodegenInput): Promise<void> {
    const state = this.extractGlobalState(input);
    if (!state) {
      logger.error(`No state found for app: ${input.documentId}`);
      return;
    }

    // Check if we have a valid app name and it's confirmed
    if (state.name && state.status === "CONFIRMED") {
      logger.info(`🔄 Starting drive editor generation for app: ${state.name}`);
      try {
        // Generate app ID using kebabCase
        const appId: string = kebabCase(state.name);
        // Generate the drive editor using the codegen function
        await generateApp({
          ...this.config.PH_CONFIG,
          appName: state.name,
          appId: appId,
          allowedDocumentTypes: state.allowedDocumentTypes ?? [],
          isDragAndDropEnabled: state.isDragAndDropEnabled,
        });

        logger.info(
          `✅ Drive editor generation completed successfully for app: ${state.name}`,
        );

        // Update the manifest with the new app
        try {
          logger.debug(
            `🔄 Updating manifest with app: ${state.name} (ID: ${appId})`,
          );

          generateManifest(
            {
              apps: [
                {
                  id: appId,
                  name: state.name,
                  app: appId,
                } as any,
              ],
            },
            this.config.CURRENT_WORKING_DIR,
          );

          logger.debug(
            `✅ Manifest updated successfully for app: ${state.name}`,
          );
        } catch (manifestError) {
          logger.error(
            `⚠️ Failed to update manifest for app ${state.name}:`,
            manifestError,
          );
          // Don't throw here - drive editor generation was successful
        }

        // Backup the document
        const fullState = input.state as AppModulePHState;
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
          `❌ Error during drive editor generation for app ${state.name}:`,
          error,
        );
        if (error instanceof Error) {
          logger.error(`❌ Error message: ${error.message}`);
        }
      }
    } else {
      if (!state.name) {
        logger.error(
          `❌ Skipping drive editor generation - missing name for app`,
        );
        return;
      } else if (state.status !== "CONFIRMED") {
        logger.error(
          `❌ Skipping drive editor generation - app "${state.name}" is not confirmed (status: ${state.status})`,
        );
        return;
      }
    }
  }
}
