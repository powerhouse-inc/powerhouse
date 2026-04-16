import type {
  VetraPackageGlobalState,
  VetraPackagePHState,
} from "../../../../document-models/vetra-package/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput } from "../types.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for package documents
 */
export class PackageGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/package";

  /**
   * Validate if this package strand should be processed
   */
  shouldProcess(input: CodegenInput): boolean {
    // First run base validation
    if (!super.shouldProcess(input)) {
      return false;
    }

    if (!input.state) {
      logger.debug(`>>> No state found for package: ${input.documentId}`);
      return false;
    }

    return true;
  }

  async generate(input: CodegenInput): Promise<void> {
    const fullState = input.state as VetraPackagePHState;
    const state = fullState.global as VetraPackageGlobalState;

    // Backup the document
    await minimalBackupDocument(
      {
        documentId: input.documentId,
        documentType: input.documentType,
        branch: input.branch,
        state: fullState,
        name: "vetra-package",
      },
      this.config.CURRENT_WORKING_DIR,
    );
  }
}
