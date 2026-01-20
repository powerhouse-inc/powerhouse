import type { IProcessor, OperationWithContext } from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import type { VetraPackageState } from "../../document-models/vetra-package/gen/schema/types.js";
import { logger } from "../codegen/logger.js";
import { type DB } from "./schema.js";

interface VetraPackageGlobalState extends VetraPackageState {}

export class VetraReadModelProcessor implements IProcessor {
  private relationalDb: Kysely<DB>;

  constructor(relationalDb: Kysely<DB>) {
    this.relationalDb = relationalDb;
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    logger.info(">>> VetraReadModelProcessor.onOperations()");
    if (operations.length === 0) return;

    for (const { operation, context } of operations) {
      if (context.documentType !== "powerhouse/package") continue;

      const state = context.resultingState
        ? (JSON.parse(context.resultingState) as VetraPackageGlobalState)
        : undefined;

      const getString = (val: unknown): string | null =>
        typeof val === "string" ? val : null;

      const now = new Date();
      const operationTimestamp = new Date(
        parseInt(operation.timestampUtcMs, 10),
      );

      await this.relationalDb
        .insertInto("vetra_package")
        .values({
          document_id: context.documentId,
          name: getString(state?.name),
          description: getString(state?.description),
          category: getString(state?.category),
          author_name: getString(state?.author?.name),
          author_website: getString(state?.author?.website),
          keywords: state?.keywords ? JSON.stringify(state.keywords) : null,
          github_url: getString(state?.githubUrl),
          npm_url: getString(state?.npmUrl),
          last_operation_index: operation.index,
          last_operation_hash: operation.hash,
          last_operation_timestamp: operationTimestamp,
          drive_id: "", // Not available in new format
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column("document_id").doUpdateSet({
            name: getString(state?.name),
            description: getString(state?.description),
            category: getString(state?.category),
            author_name: getString(state?.author?.name),
            author_website: getString(state?.author?.website),
            keywords: state?.keywords ? JSON.stringify(state.keywords) : null,
            github_url: getString(state?.githubUrl),
            npm_url: getString(state?.npmUrl),
            last_operation_index: operation.index,
            last_operation_hash: operation.hash,
            last_operation_timestamp: operationTimestamp,
            updated_at: now,
          }),
        )
        .execute();
    }
  }

  async onDisconnect() {}
}
