import { generateProcessor } from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type ProcessorModuleState } from "../../../../document-models/processor-module/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for processor documents
 */
export class ProcessorGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/processor";

  async generate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as ProcessorModuleState;

    // Check if we have a valid processor name, type, document types, and it's confirmed
    if (
      state.name &&
      state.type &&
      state.documentTypes.length > 0 &&
      state.status === "CONFIRMED"
    ) {
      logger.info(`🔄 Starting processor generation for: ${state.name}`);
      try {
        // Map the type value from document state to generateProcessor expected values
        let processorType: "analytics" | "relationalDb";
        if (state.type === "analytics") {
          processorType = "analytics";
        } else if (state.type === "relational") {
          processorType = "relationalDb";
        } else {
          logger.error(`❌ Unsupported processor type: ${state.type}`);
          return;
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
      if (!state.name) {
        logger.error(
          `❌ Skipping processor generation - missing name for processor`,
        );
        return;
      } else if (!state.type) {
        logger.error(
          `❌ Skipping processor generation - missing type for processor "${state.name}"`,
        );
        return;
      } else if (state.documentTypes.length === 0) {
        logger.error(
          `❌ Skipping processor generation - missing document types for processor "${state.name}"`,
        );
        return;
      } else if (state.status !== "CONFIRMED") {
        logger.error(
          `❌ Skipping processor generation - processor "${state.name}" is not confirmed (status: ${state.status})`,
        );
        return;
      }
    }
  }
}
