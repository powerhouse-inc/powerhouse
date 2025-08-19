import { getConfig } from "@powerhousedao/config/utils";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { DocumentCodegenFactory } from "./document-handlers/index.js";

const PH_CONFIG = getConfig();
const CURRENT_WORKING_DIR = process.cwd();

const manager = DocumentCodegenFactory.createManager({
  PH_CONFIG,
  CURRENT_WORKING_DIR,
});

export class CodegenProcessor implements IProcessor {
  async onStrands<TDocument extends DocumentModelDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    for (const strand of strands) {
      await manager.routeAndGenerate(strand);
    }
  }

  async onDisconnect() {}
}
