import { generateDriveEditor, generateManifest } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import type { InternalTransmitterUpdate } from "document-drive";
import type { DocumentModelDocument } from "document-model";
import type { AppModuleState } from "../../../../document-models/app-module/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for app documents
 */
export class AppGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/app";

  /**
   * Validate if this app strand should be processed
   */
  shouldProcess(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): boolean {
    // First run base validation
    if (!super.shouldProcess(strand)) {
      return false;
    }

    const state = strand.state as AppModuleState;
    if (!state) {
      logger.debug(`>>> No state found for app: ${strand.documentId}`);
      return false;
    }

    // Check if we have a valid app name and it's confirmed
    if (!state.name) {
      logger.debug(`>>> No name found for app: ${strand.documentId}`);
      return false;
    }

    if (state.status !== "CONFIRMED") {
      logger.debug(
        `>>> App not confirmed: ${state.name} (status: ${state.status})`,
      );
      return false;
    }

    return true;
  }

  async generate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as AppModuleState;

    // Check if we have a valid app name and it's confirmed
    if (state.name && state.status === "CONFIRMED") {
      logger.info(`🔄 Starting drive editor generation for app: ${state.name}`);
      try {
        // Generate app ID using kebabCase
        const appId: string = kebabCase(state.name);

        // Generate the drive editor using the codegen function
        await generateDriveEditor(state.name, this.config.PH_CONFIG, appId);

        logger.info(
          `✅ Drive editor generation completed successfully for app: ${state.name}`,
        );

        // Update the manifest with the new app
        try {
          logger.info(
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

          logger.info(
            `✅ Manifest updated successfully for app: ${state.name}`,
          );
        } catch (manifestError) {
          logger.error(
            `⚠️ Failed to update manifest for app ${state.name}:`,
            manifestError,
          );
          // Don't throw here - drive editor generation was successful
        }
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
