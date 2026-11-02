import { type Feature, generateProcessor } from "@powerhousedao/codegen";
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
import type { CodegenInput, CodegenJob, GenerateResult } from "../types.js";
import { installFeatureDependencies, minimalBackupDocument } from "./utils.js";

const PROCESSOR_TYPES = {
  analytics: "analytics",
  relational: "relationalDb",
} as const;

/**
 * Generator for processor documents
 */
export class ProcessorGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/processor";

  private extractGlobalState(
    input: CodegenInput,
  ): ProcessorModuleState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as ProcessorModulePHState;
    return fullState.global;
  }

  override skipReason(input: CodegenInput): string | undefined {
    const base = super.skipReason(input);
    if (base) return base;

    const reason = invalidReason(this.extractGlobalState(input));
    if (reason) logger.debug(reason);
    return reason;
  }

  async generate(
    input: CodegenInput,
    job?: CodegenJob,
  ): Promise<GenerateResult> {
    const state = this.extractGlobalState(input);
    const reason = this.skipReason(input);
    if (!state || reason) {
      return { skipped: reason ?? "The processor has no state" };
    }
    const processorType =
      PROCESSOR_TYPES[state.type as keyof typeof PROCESSOR_TYPES];
    const processorApps = state.processorApps as ProcessorApps;
    logger.info(`🔄 Starting processor generation for: ${state.name}`);
    try {
      const features: Feature[] =
        processorType === "analytics"
          ? ["analyticsProcessor"]
          : ["relationalDbProcessor"];
      await installFeatureDependencies(
        features,
        this.config.CURRENT_WORKING_DIR,
        `processor "${state.name}"`,
        job,
      );

      await generateProcessor(
        {
          processorName: state.name,
          processorType,
          documentTypes: state.documentTypes.map((dt) => dt.documentType),
          processorApps,
        },
        this.project,
      );
      await this.project.save();
    } catch (error) {
      logger.error(
        `❌ Error during processor generation for ${state.name}:`,
        error,
      );
      throw error;
    }

    logger.info(
      `✅ Processor generation completed successfully for: ${state.name}`,
    );

    await minimalBackupDocument(
      {
        documentId: input.documentId,
        documentType: input.documentType,
        branch: input.branch,
        state: input.state as ProcessorModulePHState,
        name: state.name,
      },
      this.config.CURRENT_WORKING_DIR,
    );
  }
}

function invalidReason(
  state: ProcessorModuleState | undefined,
): string | undefined {
  if (!state) return "The processor has no state";
  if (!state.name) return "The processor has no name";
  const processor = `Processor "${state.name}"`;
  if (!state.type) return `${processor} has no type`;
  if (!(state.type in PROCESSOR_TYPES)) {
    return `${processor} has the unsupported type "${state.type}"; use ${Object.keys(PROCESSOR_TYPES).join(" or ")}`;
  }
  if (state.documentTypes.length === 0) {
    return `${processor} has no document types`;
  }
  if (state.processorApps.length === 0) {
    return `${processor} has no processor apps`;
  }
  if (!isProcessorApps(state.processorApps)) {
    return `${processor} has unsupported processor apps (${state.processorApps.join(", ")}); use ${PROCESSOR_APPS.join(", ")}, each once`;
  }
  if (state.status !== "CONFIRMED") {
    return `${processor} is not confirmed (status: ${state.status}); codegen runs once it is CONFIRMED`;
  }
  return undefined;
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
