import { generateProcessor } from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type ProcessorModuleState } from "../../../document-models/processor-module/index.js";
import { logger } from "../logger.js";
import { type Config, type DocumentHandler } from "./types.js";

export class ProcessorHandler implements DocumentHandler {
  documentType = "powerhouse/processor";

  constructor(private config: Config) {}

  async handle(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as ProcessorModuleState;

    // Check if we have a valid processor name, type, and document types
    if (state.name && state.type && state.documentTypes.length > 0) {
      logger.info(`🔄 Starting processor generation for: ${state.name}`);
      try {
        // Map the type value from document state to generateProcessor expected values
        let processorType: "analytics" | "relationalDb";
        if (state.type === "analytics") {
          processorType = "analytics";
        } else if (state.type === "relational") {
          processorType = "relationalDb";
        } else {
          throw new Error(`Unsupported processor type: ${state.type}`);
        }

        // Extract document types from the state
        const documentTypes = state.documentTypes.map((dt) => dt.documentType);

        // Generate the processor using the codegen function
        await generateProcessor(
          state.name,
          processorType,
          documentTypes,
          this.config.PH_CONFIG,
        );

        logger.info(
          `✅ Processor generation completed successfully for: ${state.name}`,
        );
      } catch (error) {
        logger.error(
          `❌ Error during processor generation for ${state.name}:`,
          error,
        );
        if (error instanceof Error) {
          logger.error(`❌ Error message: ${error.message}`);
        }
      }
    } else {
      logger.warn(
        `⚠️ Skipping processor generation - missing name, type, or document types for processor`,
      );
    }
  }
}
