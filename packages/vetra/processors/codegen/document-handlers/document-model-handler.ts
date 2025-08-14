import {
  generateFromDocument,
  generateSubgraphFromDocumentModel,
  validateDocumentModelState,
} from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import {
  type DocumentModelDocument,
  type DocumentModelState,
} from "document-model";
import { logger } from "../logger.js";
import { type DocumentHandler, type Config } from "./types.js";

export class DocumentModelHandler implements DocumentHandler {
  documentType = "powerhouse/document-model";
  
  constructor(private config: Config) {}

  async handle(strand: InternalTransmitterUpdate<DocumentModelDocument>): Promise<void> {
    const state = strand.state as DocumentModelState;
    const validationResult = validateDocumentModelState(state);

    if (validationResult.isValid) {
      logger.info(
        `🔄 Starting code generation for document model: ${state.name}`,
      );
      try {
        await generateFromDocument(state, this.config.PH_CONFIG, { verbose: false });
        await generateSubgraphFromDocumentModel(
          state.name,
          state,
          this.config.PH_CONFIG,
          { verbose: false },
        );
        logger.info(
          `✅ Code generation completed successfully for: ${state.name}`,
        );
      } catch (error) {
        logger.error(
          `❌ Error during code generation for ${state.name}:`,
          error,
        );
      }
    } else {
      logger.debug(
        `❌ Validation failed for document model: ${state.name}`,
        validationResult.errors,
      );
    }
  }
}