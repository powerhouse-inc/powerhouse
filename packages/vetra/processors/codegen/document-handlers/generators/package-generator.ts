import { generateManifest } from "@powerhousedao/codegen";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument } from "document-model";
import { type VetraPackageState } from "../../../../document-models/vetra-package/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";

/**
 * Generator for package documents
 */
export class PackageGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/package";

  async generate(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): Promise<void> {
    const state = strand.state as VetraPackageState;

    logger.info("🔄 Generating manifest for package");
    generateManifest(
      {
        name: state.name ?? "",
        category: state.category ?? "",
        description: state.description ?? "",
        publisher: {
          name: state.author?.name ?? "",
          url: state.author?.website ?? "",
        },
      },
      this.config.CURRENT_WORKING_DIR,
    );
    logger.info("✅ Manifest generated successfully");
  }
}
