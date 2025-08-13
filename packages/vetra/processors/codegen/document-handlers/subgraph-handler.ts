import { generateSubgraph } from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type SubgraphModuleState } from "../../../document-models/subgraph-module/index.js";
import { logger } from "../logger.js";
import { type DocumentHandler, type Config } from "./types.js";

export class SubgraphHandler implements DocumentHandler {
  documentType = "powerhouse/subgraph";
  
  constructor(private config: Config) {}

  async handle(strand: InternalTransmitterUpdate<DocumentModelDocument>): Promise<void> {
    const state = strand.state as SubgraphModuleState;
    
    if (state.name) {
      logger.info(`🔄 Starting subgraph generation for: ${state.name}`);
      try {
        await generateSubgraph(state.name, null, this.config.PH_CONFIG);
        logger.info(
          `✅ Subgraph generation completed successfully for: ${state.name}`,
        );
      } catch (error) {
        logger.error(
          `❌ Error during subgraph generation for ${state.name}:`,
          error,
        );
      }
    } else {
      logger.warn(
        `⚠️ Skipping subgraph generation - missing name in subgraph state`,
      );
    }
  }
}