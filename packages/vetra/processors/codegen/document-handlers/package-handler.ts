import { generateManifest } from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type VetraPackageState } from "../../../document-models/vetra-package/index.js";
import { logger } from "../logger.js";
import { type Config, type DocumentHandler } from "./types.js";

export class PackageHandler implements DocumentHandler {
  documentType = "powerhouse/package";
  
  constructor(private config: Config) {}

  async handle(strand: InternalTransmitterUpdate<DocumentModelDocument>): Promise<void> {
    const state = strand.state as VetraPackageState;

    logger.info("🔄 Generating manifest for package");
    generateManifest({
      name: state.name ?? "",
      category: state.category ?? "",
      description: state.description ?? "",
      publisher: {
        name: state.author?.name ?? "",
        url: state.author?.website ?? "",
      },
    }, this.config.CURRENT_WORKING_DIR);
    logger.info("✅ Manifest generated successfully");
  }
}