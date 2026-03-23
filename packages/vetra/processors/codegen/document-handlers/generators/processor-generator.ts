import { generateProcessor } from "@powerhousedao/codegen";
import {
  PROCESSOR_APPS,
  type ProcessorApp,
  type ProcessorApps,
} from "@powerhousedao/shared/processors";
import type {
  ProcessorModulePHState,
  ProcessorModuleState,
} from "../../../../document-models/processor-module/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput } from "../types.js";
import { USE_TS_MORPH } from "./constants.js";
import { minimalBackupDocument } from "./utils.js";

/**
 * Generator for processor documents
 */
export class ProcessorGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/processor";

  /**
   * Parse and extract the global state from the serialized state string
   */
  private extractGlobalState(
    input: CodegenInput,
  ): ProcessorModuleState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as ProcessorModulePHState;
    return fullState.global;
  }

  /**
   * Validate if this processor strand should be processed
   */
  shouldProcess(input: CodegenInput): boolean {
    // First run base validation
    if (!super.shouldProcess(input)) {
      return false;
    }

    const state = this.extractGlobalState(input);
    if (!state) {
      logger.debug(`No state found for processor: ${input.documentId}`);
      return false;
    }

    // Check if we have a valid processor name, type, document types, and it's confirmed
    if (!state.name) {
      logger.debug(`No name found for processor: ${input.documentId}`);
      return false;
    }

    if (!state.type) {
      logger.debug(`No type found for processor: ${state.name}`);
      return false;
    }

    if (!state.documentTypes || state.documentTypes.length === 0) {
      logger.debug(`No document types found for processor: ${state.name}`);
      return false;
    }

    if (!state.processorApps || state.processorApps.length === 0) {
      logger.debug(`No processor apps found for processor: ${state.name}`);
      return false;
    }

    if (state.status !== "CONFIRMED") {
      logger.debug(
        `Processor not confirmed: ${state.name} (status: ${state.status})`,
      );
      return false;
    }

    return true;
  }

  async generate(input: CodegenInput): Promise<void> {
    const state = this.extractGlobalState(input);
    if (!state) {
      logger.error(`No state found for processor: ${input.documentId}`);
      return;
    }

    // Check if we have a valid processor name, type, document types, and it's confirmed
    if (
      state.name &&
      state.type &&
      state.documentTypes.length > 0 &&
      state.processorApps.length > 0 &&
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

        const processorApps = state.processorApps;

        if (!isProcessorApps(processorApps)) {
          logger.error(
            `❌ Unsupported processor apps: ${processorApps.join(", ")}`,
          );
          return;
        }

        // Generate the processor using the codegen function
        await generateProcessor({
          processorName: state.name,
          processorType,
          documentTypes,
          skipFormat: this.config.PH_CONFIG.skipFormat,
          useTsMorph: USE_TS_MORPH,
          processorApps,
        });

        logger.info(
          `✅ Processor generation completed successfully for: ${state.name}`,
        );

        // Backup the document
        const fullState = input.state as ProcessorModulePHState;
        await minimalBackupDocument(
          {
            documentId: input.documentId,
            documentType: input.documentType,
            branch: input.branch,
            state: fullState,
            name: state.name,
          },
          this.config.CURRENT_WORKING_DIR,
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

function isProcessorApps(input: readonly string[]): input is ProcessorApps {
  if (input.length === 0) return false;
  if (new Set(input).size !== input.length) {
    return false;
  }
  if (!input.every((i) => PROCESSOR_APPS.includes(i as ProcessorApp)))
    return false;

  return true;
}
