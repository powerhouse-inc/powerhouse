import { generateDriveEditor } from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type AppModuleState } from "../../../document-models/app-module/index.js";
import { logger } from "../logger.js";
import { type DocumentHandler, type Config } from "./types.js";

export class AppHandler implements DocumentHandler {
  documentType = "powerhouse/app";
  
  constructor(private config: Config) {}

  async handle(strand: InternalTransmitterUpdate<DocumentModelDocument>): Promise<void> {
    const state = strand.state as AppModuleState;

    // Check if we have a valid app name and it's confirmed
    if (state.name && state.status === "CONFIRMED") {
      logger.info(`🔄 Starting drive editor generation for app: ${state.name}`);
      try {
        // Generate the drive editor using the codegen function
        await generateDriveEditor(state.name, this.config.PH_CONFIG);

        logger.info(
          `✅ Drive editor generation completed successfully for app: ${state.name}`,
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
        logger.debug(
          `⚠️ Skipping drive editor generation - missing name for app`,
        );
      } else if (state.status !== "CONFIRMED") {
        logger.debug(
          `ℹ️ Skipping drive editor generation - app "${state.name}" is not confirmed (status: ${state.status})`,
        );
      }
    }
  }
}