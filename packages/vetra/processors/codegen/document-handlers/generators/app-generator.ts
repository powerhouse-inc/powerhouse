import { generateDriveEditor, generateManifest } from "@powerhousedao/codegen";
import { kebabCase } from "change-case";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type AppModuleState } from "../../../../document-models/app-module/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for app documents
 */
export class AppGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/app";

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
