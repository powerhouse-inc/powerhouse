import { generateDriveEditor, generateManifest } from "@powerhousedao/codegen";
import type {
  AppModuleGlobalState,
  AppModulePHState,
} from "@powerhousedao/vetra/document-models/app-module";
import { kebabCase } from "change-case";
import type { InternalTransmitterUpdate } from "document-drive";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import { USE_TS_MORPH } from "./constants.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for app documents
 */
export class AppGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/app";

  /**
   * Extract the global state from the full document state
   */
  private extractGlobalState(
    strand: InternalTransmitterUpdate,
  ): AppModuleGlobalState | undefined {
    const fullState = strand.state as AppModulePHState | undefined;
    if (!fullState) {
      return undefined;
    }
    return fullState.global;
  }

  /**
   * Validate if this app strand should be processed
   */
  shouldProcess(strand: InternalTransmitterUpdate): boolean {
    // First run base validation
    if (!super.shouldProcess(strand)) {
      return false;
    }

    const state = this.extractGlobalState(strand);
    if (!state) {
      logger.debug(`No state found for app: ${strand.documentId}`);
      return false;
    }

    // Check if we have a valid app name and it's confirmed
    if (!state.name) {
      logger.debug(`No name found for app: ${strand.documentId}`);
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

  async generate(strand: InternalTransmitterUpdate): Promise<void> {
    const state = this.extractGlobalState(strand);
    if (!state) {
      logger.error(`No state found for app: ${strand.documentId}`);
      return;
    }

    // Check if we have a valid app name and it's confirmed
    if (state.name && state.status === "CONFIRMED") {
      logger.info(`🔄 Starting drive editor generation for app: ${state.name}`);
      try {
        // Generate app ID using kebabCase
        const appId: string = kebabCase(state.name);
        // Generate the drive editor using the codegen function
        await generateDriveEditor({
          ...this.config.PH_CONFIG,
          driveEditorName: state.name,
          driveEditorId: appId,
          allowedDocumentTypes: state.allowedDocumentTypes ?? [],
          isDragAndDropEnabled: state.isDragAndDropEnabled,
          useTsMorph: USE_TS_MORPH,
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
                  driveEditor: appId,
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
        await minimalBackupDocument(
          {
            documentId: strand.documentId,
            documentType: strand.documentType,
            branch: strand.branch,
            state: strand.state as AppModulePHState,
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
