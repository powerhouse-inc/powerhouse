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

  /**
   * Validate if this package strand should be processed
   */
  shouldProcess(
    strand: InternalTransmitterUpdate<DocumentModelDocument>,
  ): boolean {
    // First run base validation
    if (!super.shouldProcess(strand)) {
      return false;
    }

    const state = strand.state as VetraPackageState;
    if (!state) {
      logger.debug(`>>> No state found for package: ${strand.documentId}`);
      return false;
    }

    return true;
  }

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
