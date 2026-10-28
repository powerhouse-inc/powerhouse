import { generateSubgraph } from "@powerhousedao/codegen";
import { findSubgraphNameConflict } from "../../../../codegen/subgraph-type-lint.js";
import type {
  SubgraphModulePHState,
  SubgraphModuleState,
} from "../../../../document-models/subgraph-module/index.js";
import { logger } from "../../logger.js";
import { BaseDocumentGen } from "../base-document-gen.js";
import type { CodegenInput, CodegenJob, GenerateResult } from "../types.js";
import {
  installFeatureDependencies,
  minimalBackupDocument,
  warnSubgraphTypeConflicts,
} from "./utils.js";

/**
 * Generator for subgraph documents
 */
export class SubgraphGenerator extends BaseDocumentGen {
  readonly supportedDocumentTypes = "powerhouse/subgraph";

  private extractGlobalState(
    input: CodegenInput,
  ): SubgraphModuleState | undefined {
    if (!input.state) {
      return undefined;
    }
    const fullState = input.state as SubgraphModulePHState;
    return fullState.global;
  }

  override skipReason(input: CodegenInput): string | undefined {
    const base = super.skipReason(input);
    if (base) return base;

    const state = this.extractGlobalState(input);
    let reason: string | undefined;
    if (!state) reason = "The subgraph has no state";
    else if (!state.name) reason = "The subgraph has no name";
    else if (state.status !== "CONFIRMED") {
      reason = `Subgraph "${state.name}" is not confirmed (status: ${state.status}); codegen runs once it is CONFIRMED`;
    }
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
      return { skipped: reason ?? "The subgraph has no state" };
    }

    logger.info(`🔄 Starting subgraph generation for: ${state.name}`);
    try {
      const conflict = await findSubgraphNameConflict(
        this.config.CURRENT_WORKING_DIR,
        state.name,
      );
      if (conflict) {
        logger.error(`❌ Skipping subgraph generation: ${conflict}`);
        return { skipped: conflict };
      }
      await installFeatureDependencies(
        ["subgraph"],
        this.config.CURRENT_WORKING_DIR,
        `subgraph "${state.name}"`,
        job,
      );
      await generateSubgraph(state.name, this.project);
      await this.project.save();
    } catch (error) {
      logger.error(
        `❌ Error during subgraph generation for ${state.name}:`,
        error,
      );
      throw error;
    }
    logger.info(
      `✅ Subgraph generation completed successfully for: ${state.name}`,
    );
    await warnSubgraphTypeConflicts(this.config.CURRENT_WORKING_DIR);

    await minimalBackupDocument(
      {
        documentId: input.documentId,
        documentType: input.documentType,
        branch: input.branch,
        state: input.state as SubgraphModulePHState,
        name: state.name,
      },
      this.config.CURRENT_WORKING_DIR,
    );
  }
}
